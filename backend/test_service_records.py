import unittest
from unittest.mock import Mock
from services.service_records import fetch_all, service_records


class ServiceRecordsTests(unittest.TestCase):
    def test_fetch_all_pages(self):
        rest = Mock(side_effect=[[{"id": i} for i in range(100)], [{"id": 100}]])
        self.assertEqual(len(fetch_all(rest, "movies")), 101)
        self.assertEqual(rest.call_args.kwargs["params"]["offset"], "100")

    def test_combines_services_and_preserves_statuses_without_private_fields(self):
        tables = {
            "users": [{"id": 1, "last_name": "Cruz", "first_name": "Ana", "role": "user", "token": "secret"}],
            "octogenarian_benefit_applications": [{"id": "b1", "user_id": 1, "benefit_type": "Octogenarian",
                "benefit_status": "Released", "validation_status": "Approved", "benefit_amount": 10000,
                "created_at": "2026-01-01", "applicant_signature": "private"}],
            "movie_reservations": [{"id": "r1", "user_id": 1, "screening_id": "s1", "status": "Cancelled", "created_at": "2026-02-01"}],
            "movie_screenings": [{"id": "s1", "movie_id": "m1", "screening_date": "2026-03-01"}],
            "movies": [{"id": "m1", "title": "Sample Movie"}],
        }
        records = service_records(lambda method, table, **kwargs: tables[table])
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["service"], "Movie Center")
        self.assertEqual(records[0]["status"], "Cancelled")
        self.assertEqual(records[0]["details"], "Sample Movie")
        self.assertEqual(records[1]["status"], "Released")
        self.assertEqual(records[1]["validation"], "Approved")
        self.assertEqual(records[1]["lastName"], "Cruz")
        self.assertNotIn("token", records[0])
        self.assertNotIn("applicant_signature", records[1])


if __name__ == "__main__":
    unittest.main()
