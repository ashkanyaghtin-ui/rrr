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
  let text = `--- INVOICE ---\n`;
  text += `Order #${order.orderNo || order.id.slice(-6).toUpperCase()}\n`;
  text += `Date: ${new Date().toLocaleString()}\n`;
  if (order.tableNumber) text += `Table: ${order.tableNumber}\n`;
  if (order.waiter) text += `Staff: ${order.waiter}\n`;
  text += `----------------\n\n`;
  
  let subtotal = 0;
  order.items.forEach(item => {
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;
    text += `${item.quantity}x ${item.name}\n`;
    text += `   @ AED ${(item.price / 100).toFixed(2)} = AED ${(itemTotal / 100).toFixed(2)}\n`;
  });

  text += `\n----------------\n`;
  text += `SUBTOTAL:  AED ${(subtotal / 100).toFixed(2)}\n`;
  
  if (order.discount) {
    const disc = order.discountType === 'percentage' 
      ? (subtotal * order.discount / 100) 
      : (order.discount * 100);
    text += `DISCOUNT: -AED ${(disc / 100).toFixed(2)}\n`;
  }

  // Tax calculation (dynamic based on total if not stored)
  const total = order.total || 0;
  const taxAmount = order.taxAmount || Math.round(total - (total / 1.05)); // Default 5% VAT if not specified
  
  if (taxAmount > 0) {
    text += `VAT (5%):  AED ${(taxAmount / 100).toFixed(2)}\n`;
  }

  text += `TOTAL:     AED ${(total / 100).toFixed(2)}\n`;
  text += `----------------\n`;

  // Only show settlement info if the order is finalized or paid
  const isSettled = order.status === 'finalized' || order.status === 'paid';
  
  if (isSettled && order.paymentMethod) {
    const methodStr = order.paymentMethod.toUpperCase() === 'MULTI' ? 'MULTI-PAYMENT' : order.paymentMethod.toUpperCase();
    text += `SETTLED VIA: ${methodStr}\n`;
    
    if (Array.isArray(order.payments) && order.payments.length > 0) {
      order.payments.forEach(p => {
        if (p.method === 'multi' || (p.cashAmount && p.cardAmount)) {
          if (p.cashAmount) text += `  - CASH: AED ${(p.cashAmount / 100).toFixed(2)}\n`;
          if (p.cardAmount) text += `  - CARD: AED ${(p.cardAmount / 100).toFixed(2)}\n`;
        } else {
          text += `  - ${p.method.toUpperCase()}: AED ${(p.amount / 100).toFixed(2)}\n`;
        }
      });
    }

    if (order.amountReceived) {
      text += `RECEIVED: AED ${(order.amountReceived / 100).toFixed(2)}\n`;
    }
    if (order.changeGiven) {
      text += `CHANGE:   AED ${(order.changeGiven / 100).toFixed(2)}\n`;
    }
    text += `----------------\n`;
  }

  text += `   THANK YOU!\n`;
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
