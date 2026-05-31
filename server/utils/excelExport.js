const ExcelJS = require('exceljs');

const exportToExcel = async (data, type, res) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Prime Billiard';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Hisobot', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } },
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: { top: { style: 'thin', color: { argb: 'FFcccccc' } }, bottom: { style: 'thin', color: { argb: 'FFcccccc' } } },
  };

  if (type === 'sessions') {
    sheet.columns = [
      { header: '#', key: 'id', width: 8 },
      { header: 'Stol', key: 'table', width: 15 },
      { header: 'Mijoz', key: 'customer', width: 20 },
      { header: 'Boshlanish', key: 'start', width: 22 },
      { header: 'Tugash', key: 'end', width: 22 },
      { header: 'Davomiyligi', key: 'duration', width: 15 },
      { header: 'Stol narxi', key: 'tableAmount', width: 15 },
      { header: 'Bar narxi', key: 'barAmount', width: 15 },
      { header: 'Jami', key: 'total', width: 18 },
      { header: "To'lov turi", key: 'payment', width: 15 },
    ];

    sheet.getRow(1).eachCell((cell) => { Object.assign(cell, headerStyle); });
    sheet.getRow(1).height = 30;

    data.forEach((session, index) => {
      const row = sheet.addRow({
        id: index + 1,
        table: session.table?.name || '-',
        customer: session.customerName || 'Noma\'lum',
        start: session.startTime ? new Date(session.startTime).toLocaleString('uz-UZ') : '-',
        end: session.endTime ? new Date(session.endTime).toLocaleString('uz-UZ') : '-',
        duration: session.durationMinutes ? `${Math.floor(session.durationMinutes / 60)}s ${session.durationMinutes % 60}d` : '-',
        tableAmount: parseFloat(session.tableAmount || 0),
        barAmount: parseFloat(session.barAmount || 0),
        total: parseFloat(session.totalAmount || 0),
        payment: session.paymentMethod || '-',
      });

      if (index % 2 === 0) {
        row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }; });
      }
    });

    const totalRow = sheet.addRow({
      id: '', table: 'JAMI:', customer: '', start: '', end: '', duration: '',
      tableAmount: data.reduce((s, d) => s + parseFloat(d.tableAmount || 0), 0),
      barAmount: data.reduce((s, d) => s + parseFloat(d.barAmount || 0), 0),
      total: data.reduce((s, d) => s + parseFloat(d.totalAmount || 0), 0),
      payment: '',
    });
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB3B' } };
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="hisobot-${Date.now()}.xlsx"`);

  await workbook.xlsx.write(res);
};

module.exports = { exportToExcel };
