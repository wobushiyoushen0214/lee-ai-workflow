"""真实临时项目断言升级、配置保留、冲突、回滚及已安装命令入口；不联网。"""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("install_workflow", ROOT / "scripts/install-workflow.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class UpdateWorkflowTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.target = self.root / "已有项目 with spaces"
        self.target.mkdir()
        self.old = self.source("old", "1.4.0")
        self.new = self.source("new", "1.4.1")
        self.write(self.new, "docs/ai-workflow.md", (self.new / "docs/ai-workflow.md").read_bytes() + b"\nupdated rule\n")

    def source(self, name, version):
        source = self.root / name
        source.mkdir()
        for path in installer.files():
            self.write(source, path.relative_to(ROOT), path.read_bytes())
        package = json.loads((source / installer.PACKAGE).read_text())
        package["version"] = version
        self.write(source, installer.PACKAGE, installer.json_bytes(package))
        return source

    def write(self, root, relative, content):
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def tree(self):
        return {p.relative_to(self.target).as_posix(): p.read_bytes()
                for p in self.target.rglob("*") if p.is_file() and "__pycache__" not in p.parts}

    def install(self):
        _, changes = installer.plan(self.target, self.old)
        installer.apply(changes)

    def update(self):
        _, changes = installer.plan_update(self.target, self.new)
        installer.apply(changes)
        return changes

    def test_first_install_records_source_and_hashes(self):
        self.install()
        state = installer.installed(self.target)
        self.assertEqual(state["version"], "1.4.0")
        self.assertEqual(state["repository"], "https://github.com/wobushiyoushen0214/lee-ai-workflow")
        self.assertEqual(state["files"]["docs/ai-workflow.md"], installer.digest((self.target / "docs/ai-workflow.md").read_bytes()))

    def test_update_preserves_adaptation_notes_and_agents_outer_bytes(self):
        original = b"# local rules\r\n\r\nkeep these bytes"
        self.write(self.target, "AGENTS.md", original)
        self.install()
        agents = self.target / "AGENTS.md"
        suffix = b"\r\n\r\n# additional project rules\r\n"
        agents.write_bytes(agents.read_bytes() + suffix)
        self.write(self.target, "docs/workflow.md", b"project commands")
        self.write(self.target, "workflow.config.json", b'{"project": "custom"}')
        self.write(self.target, ".agents/notes/implemented/feature/local.md", b"project note")
        entry = self.new / "templates/AGENTS-entry.txt"
        entry.write_bytes(entry.read_bytes().replace(installer.END.encode(), b"updated entry\n" + installer.END.encode()))
        self.update()
        self.assertTrue(agents.read_bytes().startswith(original + b"\n\n"))
        self.assertTrue(agents.read_bytes().endswith(suffix))
        self.assertIn(b"updated entry", agents.read_bytes())
        self.assertEqual((self.target / "docs/workflow.md").read_bytes(), b"project commands")
        self.assertEqual((self.target / "workflow.config.json").read_bytes(), b'{"project": "custom"}')
        self.assertEqual((self.target / ".agents/notes/implemented/feature/local.md").read_bytes(), b"project note")
        self.assertEqual((self.target / "docs/ai-workflow.md").read_bytes(), (self.new / "docs/ai-workflow.md").read_bytes())
        self.assertEqual(installer.installed(self.target)["version"], "1.4.1")

    def test_same_version_update_is_noop(self):
        self.install()
        _, changes = installer.plan_update(self.target, self.old)
        self.assertEqual(changes, [])
        before = self.tree()
        installer.apply(changes)
        self.assertEqual(self.tree(), before)

    def test_managed_file_conflict_blocks_entire_batch(self):
        self.install()
        self.write(self.target, "docs/ai-workflow.md", b"local rule change")
        before = self.tree()
        with self.assertRaisesRegex(ValueError, "未写入任何文件"):
            installer.plan_update(self.target, self.new)
        self.assertEqual(self.tree(), before)

    def test_local_edit_with_unchanged_upstream_is_preserved(self):
        self.install()
        self.write(self.target, "templates/blocked.txt", b"local template")
        self.update()
        self.assertEqual((self.target / "templates/blocked.txt").read_bytes(), b"local template")
        self.assertEqual(installer.installed(self.target)["files"]["templates/blocked.txt"],
                         installer.digest((self.old / "templates/blocked.txt").read_bytes()))

    def test_agents_block_conflict_blocks_other_updates(self):
        self.install()
        agents = self.target / "AGENTS.md"
        agents.write_bytes(agents.read_bytes().replace(installer.END.encode(), b"local block\n" + installer.END.encode()))
        entry = self.new / "templates/AGENTS-entry.txt"
        entry.write_bytes(entry.read_bytes().replace(installer.END.encode(), b"new block\n" + installer.END.encode()))
        before = self.tree()
        with self.assertRaisesRegex(ValueError, "工作流块"):
            installer.plan_update(self.target, self.new)
        self.assertEqual(self.tree(), before)

    def test_added_and_retired_managed_templates(self):
        self.write(self.old, "templates/retired.txt", b"old template")
        self.write(self.new, "templates/new.txt", b"new template")
        self.install()
        self.update()
        self.assertFalse((self.target / "templates/retired.txt").exists())
        self.assertEqual((self.target / "templates/new.txt").read_bytes(), b"new template")

    def test_local_change_to_retired_template_is_not_deleted(self):
        self.write(self.old, "templates/retired.txt", b"old template")
        self.install()
        self.write(self.target, "templates/retired.txt", b"project custom template")
        before = self.tree()
        with self.assertRaises(ValueError):
            installer.plan_update(self.target, self.new)
        self.assertEqual(self.tree(), before)

    def test_new_file_collision_is_not_overwritten(self):
        self.write(self.new, "templates/new.txt", b"upstream template")
        self.install()
        self.write(self.target, "templates/new.txt", b"existing project template")
        before = self.tree()
        with self.assertRaisesRegex(ValueError, "冲突"):
            installer.plan_update(self.target, self.new)
        self.assertEqual(self.tree(), before)

    def test_removed_local_file_stays_removed_when_upstream_is_unchanged(self):
        self.install()
        (self.target / "templates/blocked.txt").unlink()
        self.update()
        self.assertFalse((self.target / "templates/blocked.txt").exists())

    def test_adopt_keeps_project_adaptation_without_accepting_arbitrary_rules(self):
        self.install()
        (self.target / installer.STATE).unlink()
        self.write(self.target, "docs/workflow.md", b"adapted commands")
        self.write(self.target, "workflow.config.json", b"adapted configuration")
        _, changes = installer.plan(self.target, self.old, adopt=True)
        installer.apply(changes)
        self.assertEqual((self.target / "docs/workflow.md").read_bytes(), b"adapted commands")
        self.assertEqual((self.target / "workflow.config.json").read_bytes(), b"adapted configuration")
        (self.target / installer.STATE).unlink()
        before = self.tree()
        with self.assertRaisesRegex(ValueError, "已存在不同内容"):
            installer.plan(self.target, self.new, adopt=True)
        self.assertEqual(self.tree(), before)

    def test_update_without_installation_record_is_rejected(self):
        before = self.tree()
        with self.assertRaisesRegex(ValueError, "没有安装记录"):
            installer.plan_update(self.target, self.new)
        self.assertEqual(self.tree(), before)

    def test_invalid_record_cannot_manage_business_files(self):
        self.install()
        state = installer.installed(self.target)
        for relative in ["../outside.txt", "lib/main.dart", ".agents/notes/local.md"]:
            invalid = {**state, "files": {relative: installer.digest(b"")}}
            self.write(self.target, installer.STATE, installer.json_bytes(invalid))
            before = self.tree()
            with self.assertRaisesRegex(ValueError, "无效路径"):
                installer.plan_update(self.target, self.new)
            self.assertEqual(self.tree(), before)

    def test_symlinked_target_file_and_parent_are_rejected(self):
        self.install()
        path = self.target / "docs/ai-workflow.md"
        path.unlink()
        outside = self.write(self.root, "outside.md", b"outside")
        path.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "符号链接"):
            installer.plan_update(self.target, self.new)
        self.assertEqual(outside.read_bytes(), b"outside")
        path.unlink()
        self.write(self.target, "docs/ai-workflow.md", (self.old / "docs/ai-workflow.md").read_bytes())
        folder = self.target / "templates"
        folder.rename(self.target / "templates-original")
        folder.symlink_to(self.target / "templates-original", target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "符号链接"):
            installer.plan_update(self.target, self.new)

    def test_preview_preconditions_prevent_overwriting_later_edits(self):
        self.install()
        _, changes = installer.plan_update(self.target, self.new)
        self.write(self.target, "docs/ai-workflow.md", b"edited after preview")
        before = self.tree()
        with self.assertRaisesRegex(ValueError, "发生变化"):
            installer.apply(changes)
        self.assertEqual(self.tree(), before)

    def test_io_failure_restores_already_written_files(self):
        self.install()
        before = self.tree()
        _, changes = installer.plan_update(self.target, self.new)
        original = installer.atomic_write
        calls = 0

        def failing_write(path, content):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("fixture disk failure")
            original(path, content)

        with mock.patch.object(installer, "atomic_write", side_effect=failing_write):
            with self.assertRaisesRegex(ValueError, "已还原"):
                installer.apply(changes)
        self.assertEqual(self.tree(), before)

    def test_installed_update_command_preview_and_apply(self):
        self.install()
        command = [sys.executable, str(self.target / "scripts/lee-workflow.py"), "update",
                   "--source", str(self.new)]
        before = self.tree()
        preview = subprocess.run(command, cwd=self.target, capture_output=True, text=True)
        self.assertEqual(preview.returncode, 0, preview.stdout + preview.stderr)
        self.assertEqual(self.tree(), before)
        updated = subprocess.run(command + ["--apply"], cwd=self.target, capture_output=True, text=True)
        self.assertEqual(updated.returncode, 0, updated.stdout + updated.stderr)
        self.assertEqual(installer.installed(self.target)["version"], "1.4.1")

    def test_online_source_failure_does_not_change_project(self):
        self.install()
        before = self.tree()
        with mock.patch.object(installer, "checkout", side_effect=ValueError("fixture network failure")):
            with contextlib.redirect_stderr(io.StringIO()):
                result = installer.main(["update", str(self.target), "--apply"])
        self.assertEqual(result, 1)
        self.assertEqual(self.tree(), before)

    def test_source_without_valid_package_metadata_is_rejected(self):
        self.write(self.new, installer.PACKAGE, b"[]")
        with self.assertRaisesRegex(ValueError, "源目录"):
            installer.plan(self.target, self.new)
        self.assertEqual(self.tree(), {})


if __name__ == "__main__":
    unittest.main()
