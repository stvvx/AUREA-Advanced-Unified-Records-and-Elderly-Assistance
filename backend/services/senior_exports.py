"""Generate downloadable table data with A4 PDF pagination and native XLSX cells."""
from datetime import date, datetime
from io import BytesIO
from math import ceil
from textwrap import wrap
from pathlib import Path
from xml.sax.saxutils import escape

IDENTITY = ('lastName', 'firstName', 'middleName', 'oscaIdNumber')
LETTERHEAD = ('Republic of the Philippines', 'Municipality of Pateros',
              'Office of Senior Citizen Affairs')
LOGO_DIRECTORY = Path(__file__).resolve().parents[1] / 'assets' / 'export'
LOGOS = (LOGO_DIRECTORY / 'pateros.png', LOGO_DIRECTORY / 'bagong-pilipinas.png')
PDF_GROUPS = [
    ('Personal details', ('id', 'dob', 'age', 'gender', 'civilStatus', 'contact')),
    ('Contact and residence', ('email', 'address', 'role')),
    ('Family and health', ('spouse', 'children', 'category')),
    ('Income and registration', ('monthlyIncome', 'sourceOfIncome', 'occupation', 'createdAt')),
    ('Documents and enrollment', ('avatarUrl', 'birthCertificate', 'digitalSignature')),
]
WIDTHS = {'lastName': 85, 'firstName': 85, 'middleName': 75, 'oscaIdNumber': 80,
          'id': 45, 'dob': 95, 'age': 35, 'gender': 55, 'civilStatus': 75, 'contact': 100,
          'email': 170, 'address': 240, 'role': 65, 'spouse': 125, 'children': 230, 'category': 115,
          'monthlyIncome': 105, 'sourceOfIncome': 100, 'occupation': 150, 'createdAt': 125}
EXCEL_WIDTHS = {'lastName': 22, 'firstName': 24, 'middleName': 22, 'id': 12,
                'oscaIdNumber': 16, 'dob': 19, 'age': 9, 'gender': 12,
                'civilStatus': 16, 'contact': 20, 'email': 34, 'address': 52,
                'spouse': 28, 'children': 42, 'monthlyIncome': 20,
                'sourceOfIncome': 24, 'occupation': 28, 'category': 24,
                'avatarUrl': 24, 'birthCertificate': 24, 'digitalSignature': 22,
                'role': 18, 'createdAt': 28}


def validate_table(data):
    columns, rows = data.get('columns'), data.get('rows')
    if not isinstance(columns, list) or not columns or not isinstance(rows, list) or not rows:
        raise ValueError('There are no table records to export.')
    keys = [column.get('key') for column in columns if isinstance(column, dict)]
    if len(keys) != len(columns) or any(not isinstance(key, str) for key in keys) or len(set(keys)) != len(keys):
        raise ValueError('Invalid export columns.')
    for row in rows:
        if not isinstance(row, list) or len(row) != len(columns):
            raise ValueError('Export rows must include every table column.')
        for cell in row:
            if not isinstance(cell, dict) or not isinstance(cell.get('text'), str):
                raise ValueError('Invalid export cell.')
            if len(cell['text']) > 32767:
                raise ValueError('A table cell exceeds the Excel text limit. Shorten that field before exporting.')
    return columns, rows


def pdf_fonts():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    candidates = [
        (Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
        (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
    ]
    for regular, bold in candidates:
        if regular.is_file() and bold.is_file():
            if 'Registry' not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont('Registry', str(regular)))
                pdfmetrics.registerFont(TTFont('RegistryBold', str(bold)))
            return 'Registry', 'RegistryBold'
    return 'Helvetica', 'Helvetica-Bold'


def export_pdf(data):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import LongTable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, TableStyle
    columns, rows = validate_table(data)
    positions = {column['key']: index for index, column in enumerate(columns)}
    names = [key for key in IDENTITY if key in positions]
    groups = [(title, [key for key in keys if key in positions]) for title, keys in PDF_GROUPS]
    covered = set(IDENTITY).union(*(set(keys) for _, keys in groups))
    remaining = [key for key in positions if key not in covered]
    for start in range(0, len(remaining), 3):
        groups.append(('Additional details', remaining[start:start + 3]))
    groups = [(title, keys) for title, keys in groups if keys]
    if not groups:
        groups = [('Senior citizens', [])]
    service_title = {'All services': 'All services', 'Birthday Benefits': 'Birthday Benefits', 'Movie Center': 'Movie Center'}.get(data.get('service'), 'Service records')
    report_title = service_title if data.get('report') == 'service-records' else 'Senior citizens'
    if data.get('report') == 'service-records':
        groups = [(title, [key for key in keys if key in positions]) for title, keys in [
            ('Service and request', ('service', 'details', 'date')),
            ('Status and release', ('status', 'validation', 'serviceDate', 'amount')),
            ('Contact and reference', ('contact', 'address', 'reference'))]]
        groups = [(title, keys) for title, keys in groups if keys]
    regular, bold = pdf_fonts()
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=landscape(A4), leftMargin=12 * mm,
        rightMargin=12 * mm, topMargin=41 * mm, bottomMargin=14 * mm,
        title=report_title, author='OSCA Pateros')
    body = ParagraphStyle('Cell', fontName=regular, fontSize=9, leading=12, alignment=TA_LEFT, splitLongWords=True)
    heading = ParagraphStyle('Heading', parent=body, fontName=bold, textColor=colors.white)
    title_style = ParagraphStyle('Title', parent=body, fontName=bold, fontSize=13, leading=17, textColor=colors.HexColor('#0F3323'))

    def paragraph(text, style, hyperlink=None):
        if regular == 'Helvetica':
            text = text.replace('\u20b1', 'PHP ')
        content = escape(text or '-').replace('\n', '<br/>')
        if isinstance(hyperlink, str) and hyperlink.startswith(('https://', 'http://')):
            link = escape(hyperlink, {'"': '&quot;'})
            content = f'<link href="{link}" color="#1F5C3E"><u>{content}</u></link>'
        return Paragraph(content, style)

    story = []
    for index, (title, keys) in enumerate(groups):
        if index:
            story.append(PageBreak())
        selected = names + keys
        weights = [WIDTHS.get(key, 140) for key in selected]
        widths = [document.width * weight / sum(weights) for weight in weights]
        table_rows = [[paragraph(columns[positions[key]]['label'], heading) for key in selected]]
        table_rows += [[paragraph(row[positions[key]]['text'], body, row[positions[key]].get('hyperlink')) for key in selected] for row in rows]
        story.extend([Paragraph(f'{report_title} - {escape(title)}', title_style), Spacer(1, 9)])
        table = LongTable(table_rows, colWidths=widths, repeatRows=1, splitByRow=1, splitInRow=1, hAlign='LEFT')
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F3323')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F3F7F2')]),
            ('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#D8E3D9')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ]))
        story.append(table)

    def footer(canvas, doc):
        canvas.saveState()
        page_width, page_height = landscape(A4)
        for logo, x in zip(LOGOS, (document.leftMargin, page_width - document.rightMargin - 24 * mm)):
            canvas.drawImage(str(logo), x, page_height - 33 * mm, width=24 * mm,
                             height=24 * mm, preserveAspectRatio=True, anchor='c', mask='auto')
        canvas.setFillColor(colors.HexColor('#0F3323'))
        for index, line in enumerate(LETTERHEAD):
            canvas.setFont(bold if index == 2 else regular, 11)
            canvas.drawCentredString(page_width / 2, page_height - (15 + index * 5) * mm, line)
        canvas.setStrokeColor(colors.HexColor('#D8E3D9'))
        canvas.line(document.leftMargin, page_height - 36 * mm,
                    page_width - document.rightMargin, page_height - 36 * mm)
        canvas.setFont(regular, 8)
        canvas.setFillColor(colors.HexColor('#5B6E62'))
        canvas.drawString(document.leftMargin, 8 * mm, f'{len(rows)} records')
        canvas.drawRightString(landscape(A4)[0] - document.rightMargin, 8 * mm, f'Page {doc.page}')
        canvas.restoreState()
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    output.seek(0)
    return output


def excel_table_rows(rows, positions, widths, ordered):
    """Continue unusually long fields on extra rows instead of clipping at Excel's row-height limit."""
    for row in rows:
        chunks = {}
        for index, position in enumerate(positions):
            entry = row[position]
            lines = []
            for line in entry['text'].split('\n'):
                lines.extend(wrap(line, width=max(8, int((widths[index] - 3) * 0.75)),
                                  replace_whitespace=False, drop_whitespace=False) or [''])
            if len(lines) > 24:
                chunks[position] = ['\n'.join(lines[start:start + 24]) for start in range(0, len(lines), 24)]
        count = max((len(parts) for parts in chunks.values()), default=1)
        for part in range(count):
            output = [dict(entry) if part == 0 else {'text': ''} for entry in row]
            for index, position in enumerate(positions):
                if position in chunks:
                    parts = chunks[position]
                    output[position] = {'text': parts[part], 'value': parts[part]} if part < len(parts) else {'text': ''}
                elif part and ordered[index] in (*IDENTITY, 'id'):
                    output[position] = dict(row[position])
            yield output


def export_excel(data):
    from openpyxl import Workbook
    from openpyxl.drawing.image import Image
    from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, OneCellAnchor
    from openpyxl.drawing.xdr import XDRPositiveSize2D
    from openpyxl.utils.units import pixels_to_EMU
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.table import Table, TableStyleInfo
    columns, rows = validate_table(data)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = 'Service records' if data.get('report') == 'service-records' else 'Senior citizens'
    # Keep the complete letterhead within the four repeated print columns.
    for row_index, line in enumerate(LETTERHEAD, 1):
        sheet.merge_cells(start_row=row_index, start_column=2, end_row=row_index, end_column=3)
        cell = sheet.cell(row_index, 2, line)
        cell.font = Font(name='Calibri', size=12 if row_index == 2 else 11,
                         bold=row_index in (2, 3), color='0F3323')
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        sheet.row_dimensions[row_index].height = 24
    for logo, column in zip(LOGOS, (0, 3)):
        image = Image(str(logo))
        scale = 78 / max(image.width, image.height)
        image.width, image.height = image.width * scale, image.height * scale
        image.anchor = OneCellAnchor(
            _from=AnchorMarker(col=column, row=0, colOff=pixels_to_EMU(12), rowOff=pixels_to_EMU(10)),
            ext=XDRPositiveSize2D(pixels_to_EMU(image.width), pixels_to_EMU(image.height)))
        sheet.add_image(image)
    sheet.row_dimensions[4].height = 12
    header_row = 8
    # Identity leads the workbook, matching the table's frozen-name layout.
    keys = [column['key'] for column in columns]
    ordered = [key for key in IDENTITY[:3] if key in keys] + [key for key in keys if key not in IDENTITY[:3]]
    positions = [keys.index(key) for key in ordered]
    widths = []
    for index, position in enumerate(positions, 1):
        column = columns[position]
        width = EXCEL_WIDTHS.get(column['key'], 24)
        widths.append(width)
        sheet.column_dimensions[get_column_letter(index)].width = width
        cell = sheet.cell(header_row, index, column['label'])
        cell.font = Font(name='Calibri', size=11, bold=True, color='FFFFFF')
        cell.fill = PatternFill('solid', fgColor='0F3323')
        cell.alignment = Alignment(wrap_text=True, vertical='center', indent=1)
        cell.border = Border(right=Side(style='thin', color='315543'))
    last_column = get_column_letter(len(columns))
    sheet.merge_cells(f'A5:{last_column}5')
    service_title = {'All services': 'ALL SERVICES', 'Birthday Benefits': 'BIRTHDAY BENEFITS', 'Movie Center': 'MOVIE CENTER'}.get(data.get('service'), 'SERVICE RECORDS')
    sheet.cell(5, 1, service_title if data.get('report') == 'service-records' else 'SENIOR CITIZENS REGISTRY')
    sheet.cell(5, 1).font = Font(name='Calibri', size=16, bold=True, color='FFFFFF')
    sheet.cell(5, 1).alignment = Alignment(vertical='center', indent=1)
    sheet.cell(5, 1).fill = PatternFill('solid', fgColor='0F3323')
    sheet.row_dimensions[5].height = 36
    from zoneinfo import ZoneInfo
    generated = datetime.now(ZoneInfo('Asia/Manila')).strftime('%b %d, %Y %I:%M %p')
    sheet.merge_cells(f'A6:{last_column}6')
    sheet.cell(6, 1, f'{len(rows):,} records  |  Generated {generated} (Philippine time)')
    sheet.cell(6, 1).font = Font(name='Calibri', size=10, color='52695C')
    sheet.cell(6, 1).alignment = Alignment(vertical='center', indent=1)
    sheet.cell(6, 1).fill = PatternFill('solid', fgColor='E8F1EB')
    sheet.row_dimensions[6].height = 25
    sheet.row_dimensions[7].height = 10
    sheet.row_dimensions[header_row].height = 34
    border = Border(bottom=Side(style='hair', color='D8E3D9'))
    for row_index, row in enumerate(excel_table_rows(rows, positions, widths, ordered), header_row + 1):
        height = 32
        for column_index, position in enumerate(positions, 1):
            entry = row[position]
            value = entry.get('value', entry['text'])
            if value is None:
                value = entry['text']
            cell = sheet.cell(row_index, column_index, value)
            if isinstance(value, str):
                cell.data_type = 's'
                cell.number_format = '@'
            if entry.get('kind') in {'date', 'datetime'} and value:
                try:
                    parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
                    if parsed.tzinfo:
                        from zoneinfo import ZoneInfo
                        parsed = parsed.astimezone(ZoneInfo('Asia/Manila')).replace(tzinfo=None)
                    cell.value = parsed.date() if entry['kind'] == 'date' else parsed
                    cell.number_format = 'mmm d, yyyy' if entry['kind'] == 'date' else 'mmm d, yyyy h:mm AM/PM'
                except ValueError:
                    pass
            if entry.get('kind') == 'currency' and isinstance(value, (int, float)):
                cell.number_format = '"PHP "#,##0.00'
            cell.font = Font(name='Calibri', size=11, bold=ordered[column_index - 1] in IDENTITY,
                             color='13201A')
            cell.fill = PatternFill('solid', fgColor='F3F7F2' if row_index % 2 else 'FFFFFF')
            key = ordered[column_index - 1]
            centered = key in {'id', 'oscaIdNumber', 'dob', 'age', 'gender', 'civilStatus', 'createdAt'}
            cell.alignment = Alignment(vertical='center', wrap_text=True,
                horizontal='center' if centered else 'right' if key == 'monthlyIncome' else 'left',
                indent=0 if centered else 1)
            cell.border = border
            if column_index == 3:
                cell.border = Border(bottom=border.bottom, right=Side(style='medium', color='8CB19A'))
            link = entry.get('hyperlink')
            if isinstance(link, str) and link.startswith(('https://', 'http://')):
                cell.hyperlink = link
                cell.font = Font(name='Calibri', size=11, color='1F5C3E', underline='single')
            lines = sum(max(1, ceil(len(line) / max(1, (widths[column_index - 1] - 2) * 0.75))) for line in entry['text'].split('\n'))
            height = max(height, lines * 15 + 12)
        sheet.row_dimensions[row_index].height = height
    last_column = get_column_letter(len(columns))
    table = Table(displayName='SeniorRegistry', ref=f'A{header_row}:{last_column}{sheet.max_row}')
    table.tableStyleInfo = TableStyleInfo(name='TableStyleMedium4', showRowStripes=True)
    sheet.add_table(table)
    sheet.freeze_panes = 'D9'
    sheet.sheet_view.zoomScale = 85
    sheet.sheet_properties.pageSetUpPr.autoPageBreaks = True
    sheet.sheet_properties.outlinePr.summaryRight = False
    sheet.sheet_view.showGridLines = False
    sheet.print_title_rows = '1:8'
    sheet.print_title_cols = 'A:D'
    sheet.print_area = sheet.dimensions
    sheet.page_setup.orientation = 'landscape'
    sheet.page_setup.paperSize = sheet.PAPERSIZE_A4
    sheet.oddFooter.right.text = 'Page &P of &N'
    sheet.oddFooter.left.text = 'OSCA | Municipality of Pateros'
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output
