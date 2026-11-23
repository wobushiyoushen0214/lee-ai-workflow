"""验证可配置路径、真实 CLI 退出码和无覆盖接入，不访问设备或外网。"""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), ROOT / "scripts" / (name + ".py"))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class PortableWorkflowTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.target = Path(temp.name) / "项目 with spaces"
        self.target.mkdir()
        self.workflow = module("check-workflow")
        self.installer = module("install-workflow")

    def install(self):
        _, changes = self.installer.plan(self.target)
        for path, content in changes:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)

    def run_check(self, *args):
        return subprocess.run([sys.executable, str(ROOT / "scripts/check-workflow.py"),
                               "--root", str(self.target), *args], cwd=self.target.parent,
                              capture_output=True, text=True)

    def config(self, **updates):
        data = dict(self.workflow.DEFAULT_CONFIG)
        data.update(updates)
        (self.target / "workflow.config.json").write_text(json.dumps(data), encoding="utf-8")

    def test_install_and_strict_check_from_another_directory(self):
        self.install()
        checked = self.run_check("--strict", "--commits", "0")
        self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
        self.assertIn("FAIL 0 · WARN 0", checked.stdout)
        self.assertTrue((self.target / "reference/momofish-android/docs/workflow.md.txt").is_file())
        self.assertFalse(list((self.target / ".agents/notes").rglob("*.md")))

    def test_existing_agents_bytes_are_preserved_and_repeat_is_noop(self):
        original = "# 用户约定\n\n保留这条规则，末尾原本无换行"
        path = self.target / "AGENTS.md"
        path.write_text(original, encoding="utf-8")
        self.install()
        self.assertTrue(path.read_text().startswith(original + "\n\n"))
        self.assertEqual(self.installer.plan(self.target)[1], [])

    def test_different_file_conflict_writes_nothing(self):
        path = self.target / "docs/workflow.md"
        path.parent.mkdir()
        path.write_text("用户已有工作流")
        before = set(self.target.rglob("*"))
        with self.assertRaisesRegex(ValueError, "未写入任何文件"):
            self.installer.plan(self.target)
        self.assertEqual(set(self.target.rglob("*")), before)
        self.assertEqual(path.read_text(), "用户已有工作流")

    def test_malformed_agents_marker_is_rejected(self):
        (self.target / "AGENTS.md").write_text(self.installer.START)
        with self.assertRaisesRegex(ValueError, "不完整"):
            self.installer.plan(self.target)

    def test_symlink_outside_target_is_rejected(self):
        outside = self.target.parent / "outside"
        outside.mkdir()
        (self.target / "docs").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "符号链接越出"):
            self.installer.plan(self.target)
        self.assertEqual(list(outside.iterdir()), [])

    def test_preview_cli_does_not_write(self):
        checked = subprocess.run([sys.executable, str(ROOT / "scripts/install-workflow.py"), str(self.target)],
                                 capture_output=True, text=True)
        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual(list(self.target.iterdir()), [])

    def test_custom_directories_and_release_profile(self):
        self.install()
        self.config(notes_dir="review/notes", evidence_dir="review/evidence", releases_dir="review/releases",
                    release_required=["md", "build", "package"], release_optional=[])
        for directory in ["review/notes", "review/evidence", "review/releases"]:
            (self.target / directory).mkdir(parents=True)
        releases = self.target / "review/releases"
        for name in ["1.0.0.md", "1.0.0-build.txt", "1.0.0-package.json"]:
            (releases / name).write_text("项目记录")
        checked = self.run_check("--strict", "--commits", "0")
        self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
        (releases / "1.0.0-package.json").unlink()
        checked = self.run_check("--commits", "0")
        self.assertEqual(checked.returncode, 1)
        self.assertIn("package", checked.stdout)

    def test_invalid_config_and_negative_commits_return_two(self):
        for updates in [{"notes_dir": "../outside"}, {"notes_dir": str(self.target)},
                        {"allow_no_releases": "true"}, {"version": 2},
                        {"release_required": []}, {"unknown": "ignored"},
                        {"link_globs": ["../*.md"]}]:
            with self.subTest(updates=updates):
                self.config(**updates)
                self.assertEqual(self.run_check("--commits", "0").returncode, 2)
        self.config()
        self.assertEqual(self.run_check("--commits", "-1").returncode, 2)

    def test_zero_commits_never_invokes_git(self):
        with mock.patch.object(self.workflow.subprocess, "run") as run:
            self.workflow.check_commits(0)
        run.assert_not_called()

    def test_unreleased_project_policy(self):
        self.install()
        self.config(allow_no_releases=False)
        checked = self.run_check("--strict", "--commits", "0")
        self.assertEqual(checked.returncode, 1)
        self.assertIn("没有可识别的版本记录", checked.stdout)

    def test_invalid_note_class_and_implemented_proposal_fail(self):
        self.install()
        path = self.target / ".agents/notes/implemented/refactor/2026-11-11-invalid.md"
        path.parent.mkdir(parents=True)
        path.write_text((ROOT / "templates/note-implemented.md").read_text() + "\n## Proposal\n")
        checked = self.run_check("--commits", "0")
        self.assertEqual(checked.returncode, 1)
        self.assertIn("未知 Note 分类", checked.stdout)
        self.assertIn("禁止提案口吻", checked.stdout)

    def test_all_note_templates_match_their_lifecycle(self):
        self.install()
        for lifecycle in ["proposed", "implemented", "rejected", "archived"]:
            path = self.target / f".agents/notes/{lifecycle}/process/2026-11-11-template.md"
            path.parent.mkdir(parents=True)
            text = (ROOT / f"templates/note-{lifecycle}.md").read_text().replace("Archived: YYYY-MM-DD", "Archived: 2026-11-11")
            path.write_text(text)
        checked = self.run_check("--strict", "--commits", "0")
        self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)


if __name__ == "__main__":
    unittest.main()
