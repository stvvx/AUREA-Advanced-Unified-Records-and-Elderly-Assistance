import ast
from datetime import datetime
from io import BytesIO
from pathlib import Path
import re
import unittest
from flask import Flask, jsonify, request, send_file
from openpyxl import load_workbook
from pypdf import PdfReader
from services.senior_exports import export_pdf, export_excel, LETTERHEAD

FIELDS = [
    ('lastName', 'Last name'), ('firstName', 'First name'), ('middleName', 'Middle name'),
    ('id', 'Record ID'), ('oscaIdNumber', 'OSCA ID'), ('dob', 'Date of birth'), ('age', 'Age'),
    ('gender', 'Gender'), ('civilStatus', 'Civil status'), ('contact', 'Contact number'),
    ('email', 'Email'), ('address', 'Residential address'), ('spouse', 'Spouse'),
    ('children', 'Children'), ('monthlyIncome', 'Monthly income'), ('sourceOfIncome', 'Source of income'),
    ('occupation', 'Occupation'), ('category', 'Category'), ('avatarUrl', 'Photo / face enrollment'),
    ('birthCertificate', 'Birth certificate'), ('digitalSignature', 'Digital signature'),
    ('role', 'Role'), ('createdAt', 'Registered on'),
]


def fixture(count=18):
    rows = []
    for index in range(count):
        values = {key: {'text': f'{label} {index}'} for key, label in FIELDS}
        values['lastName'] = {'text': f'Surname{index:03d}'}
        values['firstName'] = {'text': 'Maria Elena'}
        values['middleName'] = {'text': 'Santos'}
        values['oscaIdNumber'] = {'text': f'PB-{index:04d}'}
        values['contact'] = {'text': '09123456789'}
        values['dob'] = {'text': 'September 14, 1944', 'value': '1944-09-14', 'kind': 'date'}
        values['monthlyIncome'] = {'text': 'PHP 5,000.00', 'value': 5000, 'kind': 'currency'}
        values['createdAt'] = {'text': 'Nov 12, 2026, 2:00 PM', 'value': '2026-11-12T06:00:00Z', 'kind': 'datetime'}
        values['children'] = {'text': 'Child One\nBirthday: June 8, 1960'}
        values['avatarUrl'] = {'text': 'View photo', 'hyperlink': 'https://example.test/photo.jpg'}
        rows.append([values[key] for key, _ in FIELDS])
    return {'columns': [{'key': key, 'label': label} for key, label in FIELDS], 'rows': rows}


class SeniorExportTests(unittest.TestCase):
    def test_pdf_is_a4_and_contains_every_column_and_record(self):
        data = fixture()
        reader = PdfReader(export_pdf(data))
        text = ' '.join(page.extract_text() for page in reader.pages)
        text = re.sub(r'\s+', ' ', text)
        for _, label in FIELDS:
            self.assertIn(label, text)
        for index in range(len(data['rows'])):
            self.assertIn(f'Surname{index:03d}', text)
        for page in reader.pages:
            self.assertAlmostEqual(float(page.mediabox.width), 841.89, delta=1)
            self.assertAlmostEqual(float(page.mediabox.height), 595.28, delta=1)
            self.assertIn('Last name', page.extract_text())
            for line in LETTERHEAD:
                self.assertIn(line, page.extract_text())
            self.assertEqual(len(page.images), 2)

    def test_excel_types_leading_zero_contacts_and_formula_text(self):
        data = fixture(2)
        data['rows'][0][1] = {'text': '=SUM(1,2)'}
        workbook = load_workbook(export_excel(data))
        sheet = workbook.active
        self.assertEqual(sheet.max_column, len(FIELDS))
        self.assertEqual(sheet.max_row, 10)
        self.assertEqual([cell.value for cell in sheet[8]], [label for _, label in FIELDS])
        self.assertEqual(sheet.freeze_panes, 'D9')
        self.assertEqual([sheet.cell(row, 2).value for row in range(1, 4)], list(LETTERHEAD))
        self.assertEqual(len(sheet._images), 2)
        self.assertEqual(sheet.tables['SeniorRegistry'].ref, 'A8:W10')
        self.assertEqual(sheet.print_title_rows, '$1:$8')
        self.assertEqual(sheet.cell(9, 2).data_type, 's')
        self.assertEqual(sheet.cell(9, 10).value, '09123456789')
        self.assertEqual(sheet.cell(9, 6).value, datetime(1944, 9, 14))
        self.assertEqual(sheet.cell(9, 15).value, 5000)
        self.assertEqual(sheet.cell(9, 23).value, datetime(2026, 11, 12, 14))
        self.assertEqual(sheet.cell(9, 19).hyperlink.target, 'https://example.test/photo.jpg')

    def test_long_children_field_continues_without_losing_tail(self):
        data = fixture(1)
        text = ('Long child details ' * 300) + ' FINAL_CHILD_MARKER'
        data['rows'][0][13] = {'text': text}
        pdf = PdfReader(export_pdf(data))
        self.assertIn('FINAL_CHILD_MARKER', ' '.join(page.extract_text() for page in pdf.pages))
        sheet = load_workbook(export_excel(data)).active
        self.assertGreater(sheet.max_row, 2)
        self.assertTrue(all((dimension.height or 0) <= 409 for dimension in sheet.row_dimensions.values()))
        self.assertIn('FINAL_CHILD_MARKER', ''.join(str(sheet.cell(row, 14).value or '') for row in range(9, sheet.max_row + 1)))
        self.assertTrue(all(sheet.cell(row, 1).value == 'Surname000' for row in range(9, sheet.max_row + 1)))

    def test_export_endpoint_permissions_and_file_response(self):
        application = Flask('export-test')
        tree = ast.parse(Path(__file__).with_name('app.py').read_text(encoding='utf-8'))
        handler = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'export_senior_table')
        handler.decorator_list = []
        role = ['osca admin']
        context = {'request': request, 'jsonify': jsonify, 'send_file': send_file, 'app': application,
                   'current_session': lambda: (jsonify({'user': {'role': role[0]}}), 200)}
        exec(compile(ast.Module(body=[handler], type_ignores=[]), 'export-route', 'exec'), context)
        application.add_url_rule('/export', view_func=context['export_senior_table'], methods=['POST'])
        client = application.test_client()
        response = client.post('/export', json={**fixture(1), 'format': 'pdf'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'application/pdf')
        self.assertIn('attachment', response.headers['Content-Disposition'])
        role[0] = 'user'
        self.assertEqual(client.post('/export', json={**fixture(1), 'format': 'xlsx'}).status_code, 403)


if __name__ == '__main__':
    unittest.main()
