"""用临时目录验证工作流状态、证据链接和退出码，不访问设备或外网。"""

import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest import mock


spec = importlib.util.spec_from_file_location("check_workflow", Path(__file__).with_name("check-workflow.py"))
workflow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workflow)


class WorkflowChecksTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.notes = self.root / ".agents" / "notes"
        self.evidence = self.root / "docs" / "ux-evidence"
        self.notes.mkdir(parents=True)
        self.evidence.mkdir(parents=True)
        self.entry = self.write("docs/ai-workflow.md", "")
        patches = mock.patch.multiple(
            workflow, ROOT=self.root, NOTES_DIR=self.notes,
            EVIDENCE_DIR=self.evidence, RELEASES_DIR=self.root / "docs/releases",
            LINK_DOCS=[self.entry], results=[],
        )
        patches.start()
        self.addCleanup(patches.stop)

    def write(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        return target

    def note(self, lifecycle, status):
        body = "## Proposal\n方案\n## Acceptance criteria\n可核对\n## Risks\n无额外风险\n"
        if lifecycle in {"implemented", "archived"}:
            body = "## Decision\n决定\n## Validation\n已核对\n## Consequences\n代价\n"
        archived = "Archived: 2026-11-04\n" if lifecycle == "archived" else ""
        return self.write(
            f".agents/notes/{lifecycle}/process/2026-11-04-fixture.md",
            f"# Agent Note: 夹具\n\nStatus: {status}\n{archived}\n"
            f"## Problem\n问题\n{body}## Alternatives considered\n保留现状\n",
        )

    def messages(self, level):
        return [message for actual, _, message in workflow.results if actual == level]

    def test_valid_proposed_implemented_and_archived(self):
        for lifecycle, status in [("proposed", "proposed"), ("implemented", "implemented"), ("archived", "implemented")]:
            self.note(lifecycle, status)
        workflow.check_notes()
        self.assertEqual(workflow.results, [])

    def test_rejected_keeps_proposal_without_implementation_validation(self):
        self.note("rejected", "rejected — 收益不足")
        workflow.check_notes()
        self.assertEqual(workflow.results, [])

    def test_rejected_requires_reason(self):
        self.note("rejected", "rejected")
        workflow.check_notes()
        self.assertTrue(any("原因" in message for message in self.messages("FAIL")))

    def test_rejected_status_cannot_be_in_proposed_directory(self):
        self.note("proposed", "rejected — 收益不足")
        workflow.check_notes()
        self.assertTrue(any("目录" in message for message in self.messages("FAIL")))

    def test_archived_is_a_directory_not_a_status(self):
        self.note("archived", "archived")
        workflow.check_notes()
        self.assertTrue(self.messages("FAIL"))

    def test_archived_requires_date(self):
        path = self.note("archived", "implemented")
        path.write_text(path.read_text().replace("Archived: 2026-11-04\n", ""))
        workflow.check_notes()
        self.assertTrue(any("Archived" in message for message in self.messages("FAIL")))

    def test_unknown_lifecycle_is_rejected(self):
        self.note("finished", "implemented")
        workflow.check_notes()
        self.assertTrue(any("生命周期" in message for message in self.messages("FAIL")))

    def test_missing_entry_document_link_fails(self):
        self.entry.write_text("[输出](missing.txt)")
        workflow.check_links()
        self.assertEqual(len(self.messages("FAIL")), 1)

    def test_note_and_nested_evidence_readme_links_are_checked(self):
        note = self.note("implemented", "implemented")
        note.write_text(note.read_text() + "\n[输出](missing.txt)\n")
        self.write("docs/ux-evidence/2026-11-04-fixture/nested/README.md", "![截图](missing.png)")
        workflow.check_links()
        self.assertEqual(len(self.messages("FAIL")), 2)

    def test_code_examples_and_external_links_are_ignored(self):
        self.entry.write_text(
            "```markdown\n[示例](missing.md)\n```\n"
            "~~~text\n![示例](missing.png)\n~~~\n"
            "`[行内示例](missing.txt)`\n"
            "[网页](https://example.invalid/page) [邮件](mailto:test@example.invalid)\n"
            "[会话](codex://threads/example) [页内](#不存在的锚点)\n"
        )
        workflow.check_links()
        self.assertEqual(workflow.results, [])

    def test_numeric_opaque_uris_are_not_source_line_references(self):
        self.entry.write_text("[电话](tel:10086) [标识](urn:12345)")
        workflow.check_links()
        self.assertEqual(workflow.results, [])

    def test_encoded_paths_titles_and_fragments(self):
        self.write("docs/final report.txt", "输出")
        self.entry.write_text('[输出](final%20report.txt#结果 "标题")')
        workflow.check_links()
        self.assertEqual(workflow.results, [])

    def test_parentheses_and_angle_bracket_paths(self):
        self.write("docs/output(final).txt", "输出")
        self.write("docs/final report(1).txt", "输出")
        self.entry.write_text('[输出](output(final).txt) [输出](<final report(1).txt> "标题")')
        workflow.check_links()
        self.assertEqual(workflow.results, [])

    def test_escaped_parentheses(self):
        self.write("docs/output(final).txt", "输出")
        self.entry.write_text(r"[输出](output\(final\).txt)")
        workflow.check_links()
        self.assertEqual(workflow.results, [])

    def test_source_line_and_column_suffixes(self):
        source = self.write("docs/source.kt", "源码夹具")
        self.entry.write_text(f"[相对源码](source.kt:42) [绝对源码]({source}:42:3)")
        workflow.check_links()
        self.assertEqual(workflow.results, [])

    def test_missing_source_with_line_suffix_still_fails(self):
        self.entry.write_text("[源码](missing.kt:42:3)")
        workflow.check_links()
        self.assertEqual(len(self.messages("FAIL")), 1)

    def test_literal_filename_with_numeric_colon_suffix(self):
        self.write("docs/report.txt:42", "历史输出夹具")
        self.entry.write_text("[输出](report.txt:42)")
        workflow.check_links()
        self.assertEqual(workflow.results, [])

    def test_reference_link_and_image_targets(self):
        self.entry.write_text('[输出][result]\n![截图][image]\n\n[result]: missing.txt\n[image]: missing.png "截图"\n')
        workflow.check_links()
        self.assertEqual(len(self.messages("FAIL")), 2)
        self.write("docs/missing.txt", "输出")
        self.write("docs/missing.png", "截图夹具")
        workflow.results.clear()
        workflow.check_links()
        self.assertEqual(workflow.results, [])

    def call_main(self, argv, level=None):
        def add_issue():
            if level:
                workflow.add(level, self.entry, "夹具问题")

        output = io.StringIO()
        with mock.patch("sys.argv", ["check-workflow.py", *argv]), \
                mock.patch.object(workflow, "check_notes", side_effect=add_issue), \
                mock.patch.object(workflow, "check_evidence"), \
                mock.patch.object(workflow, "check_releases"), \
                mock.patch.object(workflow, "check_links"), \
                mock.patch.object(workflow, "check_commits") as commits, \
                contextlib.redirect_stdout(output):
            code = workflow.main()
        return code, commits, output.getvalue()

    def test_documented_commits_option(self):
        code, commits, _ = self.call_main(["--commits", "3"])
        self.assertEqual(code, 0)
        commits.assert_called_once_with(3)

    def test_warn_is_nonblocking_without_strict(self):
        code, _, output = self.call_main([], "WARN")
        self.assertEqual(code, 0)
        self.assertIn("FAIL 0 · WARN 1", output)

    def test_strict_warn_and_regular_fail_are_blocking(self):
        self.assertEqual(self.call_main(["--strict"], "WARN")[0], 1)
        workflow.results.clear()
        self.assertEqual(self.call_main([], "FAIL")[0], 1)


if __name__ == "__main__":
    unittest.main()
