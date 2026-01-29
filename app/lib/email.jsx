"use client"
import nodemailer from 'nodemailer';

// Create reusable transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'your-app-password',
  },
});

// Generate email HTML
const generateSaleEmailHTML = (saleData) => {
  const saleDate = saleData.soldAt ? 
    (saleData.soldAt.toDate ? saleData.soldAt.toDate() : new Date(saleData.soldAt)) : 
    new Date();
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Sale Notification</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #f5f5f5;
          margin: 0;
          padding: 20px;
        }
        .container {
          max-width: 700px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #0f172a, #1e293b);
          color: white;
          padding: 30px;
          text-align: center;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          color: #60a5fa;
          margin-bottom: 10px;
        }
        .content {
          padding: 30px;
        }
        .section {
          margin-bottom: 25px;
          padding-bottom: 20px;
          border-bottom: 1px solid #e2e8f0;
        }
        .section-title {
          color: #1e293b;
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 15px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-top: 15px;
        }
        .info-item {
          background: #f8fafc;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #3b82f6;
        }
        .info-label {
          font-size: 12px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 5px;
        }
        .info-value {
          font-size: 16px;
          font-weight: 500;
          color: #1e293b;
        }
        .highlight {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          padding: 25px;
          border-radius: 10px;
          margin: 25px 0;
        }
        .highlight-value {
          font-size: 32px;
          font-weight: bold;
          margin: 10px 0;
        }
        .footer {
          background: #f1f5f9;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
        }
        .badge {
          display: inline-block;
          padding: 4px 12px;
          background: #3b82f6;
          color: white;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
        }
        .qr-note {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 8px;
          padding: 15px;
          margin-top: 20px;
          color: #0369a1;
        }
        @media (max-width: 600px) {
          .container {
            border-radius: 8px;
          }
          .content {
            padding: 20px;
          }
          .info-grid {
            grid-template-columns: 1fr;
          }
          .highlight-value {
            font-size: 24px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">KM ELECTRONICS</div>
          <h1 style="margin: 10px 0; font-size: 24px;">🎉 New Sale Completed!</h1>
          <p style="opacity: 0.9; margin: 0;">Sales System Notification</p>
        </div>
        
        <div class="content">
          <!-- Summary Section -->
          <div class="highlight">
            <div style="font-size: 14px; opacity: 0.9;">TOTAL SALE AMOUNT</div>
            <div class="highlight-value">MK ${(saleData.finalSalePrice || 0).toLocaleString()}</div>
            <div style="display: flex; justify-content: center; gap: 20px; margin-top: 15px;">
              <div>
                <div style="font-size: 12px; opacity: 0.9;">Receipt</div>
                <div style="font-weight: 500;">${saleData.receiptNumber}</div>
              </div>
              <div>
                <div style="font-size: 12px; opacity: 0.9;">Location</div>
                <div style="font-weight: 500;">${saleData.location}</div>
              </div>
            </div>
          </div>
          
          <!-- Customer Info -->
          <div class="section">
            <div class="section-title">
              👤 Customer Information
            </div>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Customer Name</div>
                <div class="info-value">${saleData.customerName || 'Walk-in Customer'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Contact Phone</div>
                <div class="info-value">${saleData.customerPhone || 'Not Provided'}</div>
              </div>
            </div>
          </div>
          
          <!-- Sale Details -->
          <div class="section">
            <div class="section-title">
              📦 Sale Details
            </div>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Item Code</div>
                <div class="info-value">${saleData.itemCode}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Product</div>
                <div class="info-value">${saleData.brand} ${saleData.model}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Quantity</div>
                <div class="info-value">${saleData.quantity}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Unit Price</div>
                <div class="info-value">MK ${(saleData.retailPrice || 0).toLocaleString()}</div>
              </div>
            </div>
          </div>
          
          <!-- Financial Info -->
          <div class="section">
            <div class="section-title">
              💰 Financial Summary
            </div>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Cost Price</div>
                <div class="info-value">MK ${(saleData.costPrice || 0).toLocaleString()}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Profit</div>
                <div class="info-value" style="color: #10b981; font-weight: 600;">
                  MK ${(saleData.profit || 0).toLocaleString()}
                </div>
              </div>
              <div class="info-item">
                <div class="info-label">Discount</div>
                <div class="info-value">${saleData.discountPercentage || 0}%</div>
              </div>
              <div class="info-item">
                <div class="info-label">Payment Method</div>
                <div class="info-value">${saleData.paymentMethod || 'Cash'}</div>
              </div>
            </div>
          </div>
          
          <!-- Staff Info -->
          <div class="section">
            <div class="section-title">
              👨‍💼 Sale Staff
            </div>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Sold By</div>
                <div class="info-value">${saleData.soldByName}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Date & Time</div>
                <div class="info-value">${saleDate.toLocaleString()}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Status</div>
                <div class="info-value">
                  <span class="badge">Completed ✅</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- QR Code Note -->
          <div class="qr-note">
            <strong>📄 Receipt Generated:</strong> A professional receipt with QR code has been generated and attached to this email.
            <br>
            <small>The QR code contains warranty information and can be scanned for verification.</small>
          </div>
        </div>
        
        <div class="footer">
          <p>This is an automated notification from KM Electronics Sales System.</p>
          <p>© ${new Date().getFullYear()} KM Electronics | All rights reserved</p>
          <p style="font-size: 11px; margin-top: 10px; color: #94a3b8;">
            Contact: +86 187 1117 7003 | +265 995 181 454
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Main function to send sale email with PDF attachment
export const sendSaleEmail = async (saleData, pdfBuffer = null) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.warn('Email credentials not configured. Skipping email notification.');
      return { success: false, error: 'Email credentials not configured' };
    }

    const recipients = (process.env.EMAIL_RECIPIENTS || 'kaizenamante365@gmail.com')
      .split(',')
      .map(email => email.trim());

    // Prepare email options
    const mailOptions = {
      from: `KM Electronics Sales System <${process.env.EMAIL_USER}>`,
      to: recipients,
      subject: `✅ Sale Completed: ${saleData.receiptNumber} - ${saleData.location}`,
      html: generateSaleEmailHTML(saleData),
      text: `New Sale Notification\n\nReceipt: ${saleData.receiptNumber}\nAmount: MK ${saleData.finalSalePrice}\nCustomer: ${saleData.customerName}\nLocation: ${saleData.location}\nSold By: ${saleData.soldByName}`,
    };

    // Add PDF attachment if provided
    if (pdfBuffer) {
      mailOptions.attachments = [{
        filename: `Receipt_${saleData.receiptNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }];
    }

    // Send email
    const info = await transporter.sendMail(mailOptions);
    return { 
      success: true, 
      messageId: info.messageId,
      recipients: recipients.length 
    };
    
  } catch (error) {
    alert('❌ Email sending error:', error);
    
    // Don't throw error - sale should complete even if email fails
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
};

// Test email function
export const testEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log('✅ Email server connection verified');
    return { success: true, message: 'Email server connection verified' };
  } catch (error) {
    alert('❌ Email connection test failed:', error);
    return { success: false, error: error.message };
  }
};