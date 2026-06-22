import unittest

from app import validate_approval


class ApprovalTests(unittest.TestCase):
    def test_rejects_missing_approval(self):
        with self.assertRaisesRegex(ValueError, "approval ontbreekt"):
            validate_approval(None)

    def test_rejects_missing_human_approval(self):
        with self.assertRaisesRegex(ValueError, "menselijke goedkeuring ontbreekt"):
            validate_approval({"approvalText": "BEL", "reviewedBy": "platform"})

    def test_rejects_wrong_approval_text(self):
        with self.assertRaisesRegex(ValueError, "approvalText moet exact BEL zijn"):
            validate_approval({"humanApproved": True, "approvalText": "bel", "reviewedBy": "platform"})

    def test_rejects_missing_reviewer(self):
        with self.assertRaisesRegex(ValueError, "reviewedBy ontbreekt"):
            validate_approval({"humanApproved": True, "approvalText": "BEL"})

    def test_accepts_explicit_approval(self):
        self.assertIsNone(validate_approval({"humanApproved": True, "approvalText": "BEL", "reviewedBy": "platform"}))


if __name__ == "__main__":
    unittest.main()
