const PDFDocument = require('pdfkit');

const exportToPDF = (data, type, title, res) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="hisobot-${Date.now()}.pdf"`);

  doc.pipe(res);

  doc.fontSize(20).fillColor('#1a1a2e').text('Prime Billiard Club', { align: 'center' });
  doc.fontSize(14).fillColor('#555').text(title, { align: 'center' });
  doc.fontSize(10).fillColor('#888').text(`Sana: ${new Date().toLocaleDateString('uz-UZ')}`, { align: 'center' });
  doc.moveDown(1);

  if (type === 'sessions' && data.length > 0) {
    const tableTop = doc.y;
    const cols = [
      { label: '#', x: 40, width: 30 },
      { label: 'Stol', x: 70, width: 80 },
      { label: 'Mijoz', x: 150, width: 100 },
      { label: 'Boshlanish', x: 250, width: 110 },
      { label: 'Davomiyligi', x: 360, width: 80 },
      { label: "Stol narxi", x: 440, width: 80 },
      { label: 'Bar narxi', x: 520, width: 80 },
      { label: 'Jami', x: 600, width: 80 },
    ];

    doc.rect(40, tableTop, 680, 20).fill('#1a1a2e');
    doc.fillColor('white').fontSize(9);
    cols.forEach(col => doc.text(col.label, col.x, tableTop + 5, { width: col.width }));

    let y = tableTop + 20;
    data.forEach((session, i) => {
      if (y > 500) {
        doc.addPage({ layout: 'landscape' });
        y = 40;
      }

      if (i % 2 === 0) doc.rect(40, y, 680, 18).fill('#f5f5f5');
      doc.fillColor('#333').fontSize(8);

      const duration = session.durationMinutes ? `${Math.floor(session.durationMinutes / 60)}s ${session.durationMinutes % 60}d` : '-';
      const row = [
        i + 1,
        session.table?.name || '-',
        session.customerName || "Noma'lum",
        session.startTime ? new Date(session.startTime).toLocaleString('uz-UZ') : '-',
        duration,
        `${parseFloat(session.tableAmount || 0).toLocaleString()} so'm`,
        `${parseFloat(session.barAmount || 0).toLocaleString()} so'm`,
        `${parseFloat(session.totalAmount || 0).toLocaleString()} so'm`,
      ];

      cols.forEach((col, ci) => {
        doc.text(String(row[ci]), col.x, y + 4, { width: col.width, ellipsis: true });
      });
      y += 18;
    });

    const total = data.reduce((s, d) => s + parseFloat(d.totalAmount || 0), 0);
    doc.rect(40, y, 680, 20).fill('#FFC107');
    doc.fillColor('#000').fontSize(10).text(`Jami: ${total.toLocaleString()} so'm`, 540, y + 5);
  }

  doc.end();
};

module.exports = { exportToPDF };
