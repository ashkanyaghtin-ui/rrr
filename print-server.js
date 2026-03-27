const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Configuration for multiple printers
// You can map specific types of prints to specific printer names installed on your OS
const PRINTERS = {
  kot: 'Kitchen_Printer', // Replace with your actual kitchen printer name
  bill: 'Front_Desk_Printer' // Replace with your actual receipt printer name
};

const printText = (text, printerName) => {
  const tempFile = path.join(__dirname, `temp_print_${Date.now()}.txt`);
  fs.writeFileSync(tempFile, text);

  // Windows printing command
  let command = `notepad /p "${tempFile}"`;
  
  // If a specific printer is provided, use it (Windows specific using print command or powershell)
  if (printerName) {
    // Using powershell to print to a specific printer
    command = `powershell -Command "Start-Process -FilePath '${tempFile}' -Verb PrintTo '${printerName}' -PassThru | %{sleep 2;$_} | kill"`;
  }

  // For Linux/Mac, you would use 'lp' or 'lpr'
  if (process.platform !== 'win32') {
    command = printerName ? `lp -d ${printerName} "${tempFile}"` : `lp "${tempFile}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.error(`Print error: ${error.message}`);
    }
    // Cleanup temp file after a short delay
    setTimeout(() => {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }, 5000);
  });
};

app.post('/print-kot', (req, res) => {
  const order = req.body;
  let text = `--- KITCHEN ORDER TICKET ---\n`;
  text += `Order #${order.id.slice(-6).toUpperCase()}\n`;
  text += `Type: ${order.orderType.toUpperCase()}\n`;
  if (order.tableId) text += `Table: ${order.tableId}\n`;
  text += `Date: ${new Date().toLocaleString()}\n\n`;
  
  order.items.forEach(item => {
    text += `${item.quantity}x ${item.name}\n`;
    if (item.notes) text += `   Note: ${item.notes}\n`;
  });
  text += `----------------------------\n`;

  // Print to the configured KOT printer
  printText(text, PRINTERS.kot);
  res.json({ success: true });
});

app.post('/print-bill', (req, res) => {
  const order = req.body;
  let text = `--- RECEIPT ---\n`;
  text += `Order #${order.id.slice(-6).toUpperCase()}\n`;
  text += `Date: ${new Date().toLocaleString()}\n\n`;
  
  order.items.forEach(item => {
    text += `${item.quantity}x ${item.name} - $${(item.price * item.quantity / 100).toFixed(2)}\n`;
  });
  text += `\nTotal: $${(order.total / 100).toFixed(2)}\n`;
  text += `----------------\n`;

  // Print to the configured Bill printer
  printText(text, PRINTERS.bill);
  res.json({ success: true });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Print server running on http://localhost:${PORT}`);
  console.log(`Configured Printers:`);
  console.log(`- KOT: ${PRINTERS.kot}`);
  console.log(`- Bill: ${PRINTERS.bill}`);
});
