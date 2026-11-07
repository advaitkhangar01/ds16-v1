# Design Studio 16 (DS16) — Authoritative Brand Specification

> **MANDATORY SYSTEM DIRECTIVE**: This document defines the single, immutable source of truth for all brand identity, corporate credentials, billing parameters, and organizational metadata across the **Design Studio 16 (DS16)** CRM Portal, backend services, database ledgers, invoices, and reports. Any inclusion of external client names (such as NEBE, W4Y, or others) as system brand identities is strictly prohibited.

---

## 1. Corporate & Trade Identity

| Attribute | Canonical Value | Notes / Usage |
| :--- | :--- | :--- |
| **Official Brand Name** | **Design Studio 16** | Primary display name across UI, App Header, and Page Titles |
| **Short / Acronym Form** | **DS16** | Codebase identifier, database name, and short badge format |
| **Legal / Trade Name** | **Design Studio Sixteen** | Bank account title and legal contract entity |
| **Industry / Core Domain** | **Architecture • Interiors • Project Execution** | Sub-header banner across invoices and proposals |
| **Founder & Principal Architect**| **Ar. Abhijit Gaulkar** | Authorized Signatory on all Pro Forma & Tax Invoices |
| **Official Contact Phone** | **+91 97663 39141** | Primary office phone & WhatsApp share dispatch |
| **Official Business Email** | **ddesignstudio.16@gmail.com** | Primary invoicing, accounting, and communication email |
| **Production Domain URL** | **https://crm.designstudio16.co.in** | Deployed VPS production web application endpoint |

---

## 2. Statutory & Tax Registration Identifiers

| Statutory Identifier | Registered Value | Jurisdiction / Authority |
| :--- | :--- | :--- |
| **GSTIN (Goods & Services Tax)** | `27AJKPG8543M1ZN` | Maharashtra, India (State Code: 27) |
| **PAN (Permanent Account Number)**| `AJKPG8543M` | Income Tax Department, Government of India |
| **SAC / HSN Service Code** | `998321` / `998322` | Architectural & Interior Design Services |
| **Default Statutory TDS Rate** | `10.00%` (Sec 194J) / `2.00%` (Sec 194C) | Applicable to professional architectural fees |

---

## 3. Registered Office & Billing Headquarters

```text
Design Studio 16
104, A, Pande Layout, Khamla,
Nagpur – 440025, Maharashtra, India
```

---

## 4. Official Banking & Payment Settlement Details

All client payments, project stage receipts, retainers, and invoice transactions must strictly map to the following corporate account:

| Banking Parameter | Authorized Value |
| :--- | :--- |
| **Beneficiary Account Name** | **Design Studio Sixteen** |
| **Bank Account Number** | `0058107040000460` |
| **Bank Name** | **The Maharashtra State Co-operative Bank Ltd** |
| **Branch Name** | **RANAPRATAP NAGAR** |
| **IFSC Code** | `MSCI0082056` |
| **MICR Code** | `440082005` |
| **Primary Currency** | **Indian Rupee (INR / ₹)** |

---

## 5. Visual Identity & Brand Design Tokens

### 5.1 Color Palette
- **Architectural Dark (Primary)**: `#1A1A1A` — Used for main navigation, typography, sidebar, and headers.
- **Studio Rust / Accent Orange**: `#E05A1E` — Used for highlights, CTAs, invoice badges, and document accents.
- **Pure White**: `#FFFFFF` — Document canvas and cards.
- **Neutral Slate / Gray**: `#64748B` / `#F8FAFC` — Borders, muted labels, and alternating row backgrounds.

### 5.2 Logo & Graphic Assets
- **Primary Raster Logo**: `/logo.jpg` (located in `client/public/logo.jpg`)
- **Favicon**: `/favicon.png` & `/favicon.svg`
- **Header Title**: `Design Studio 16`
- **Authorized Seal**: Digital Signature stamp for `Ar. Abhijit Gaulkar`

---

## 6. Pro Forma Invoice Specifications

Every generated invoice within DS16 must render the corporate header strictly as follows:

```text
+-----------------------------------------------------------------------------------------------+
|                                      PRO FORMA INVOICE                                        |
+-------------------------------------------------------+---------------------------------------+
|  [LOGO]  DESIGN STUDIO 16                             | Document Type:  PRO FORMA INVOICE     |
|          Architecture • Interiors                     | Date:           DD/MM/YYYY            |
|                                                       | Ref No:         DS16/YYYY-YY/XXXX     |
|  104, A, Pande Layout, Khamla, Nagpur                 | Buyer's Order:  [Order Number]        |
|  E-Mail: ddesignstudio.16@gmail.com                   | Delivery Terms: Milestone Delivery    |
|  GSTIN:  27AJKPG8543M1ZN                              |                                       |
+-------------------------------------------------------+---------------------------------------+
|  Buyer (Bill To): [Client Name / Company]                                                     |
|  Address: [Client Site / Office Address]                                                      |
|  GSTIN: [Client GSTIN] | Phone: [Client Phone]                                                |
+-----------------------------------------------------------------------------------------------+
```

---

## 7. Database `app_settings` Canonical JSON Mapping

The `app_settings` table in PostgreSQL must maintain the following keys and values at all times:

```sql
UPDATE app_settings SET value = 'Design Studio 16' WHERE key = 'company_name';
UPDATE app_settings SET value = 'Architecture • Interiors' WHERE key = 'company_slogan';
UPDATE app_settings SET value = '104, A, Pande Layout, Khamla, Nagpur, Maharashtra, India' WHERE key = 'company_address';
UPDATE app_settings SET value = 'ddesignstudio.16@gmail.com' WHERE key = 'company_email';
UPDATE app_settings SET value = '+91 97663 39141' WHERE key = 'company_phone';
UPDATE app_settings SET value = '27AJKPG8543M1ZN' WHERE key = 'company_gst';
UPDATE app_settings SET value = 'AJKPG8543M' WHERE key = 'company_pan';
UPDATE app_settings SET value = 'https://crm.designstudio16.co.in' WHERE key = 'company_website';
UPDATE app_settings SET value = '/logo.jpg' WHERE key = 'company_logo';
UPDATE app_settings SET value = '{
  "name": "Design Studio 16",
  "trade_name": "Design Studio Sixteen",
  "tagline": "Architecture • Interiors",
  "logo_url": "/logo.jpg",
  "logo_type": "image",
  "text_logo": "DS16",
  "container_style": "black",
  "address": "104, A, Pande Layout, Khamla, Nagpur, Maharashtra, India",
  "email": "ddesignstudio.16@gmail.com",
  "phone": "+91 97663 39141",
  "gst": "27AJKPG8543M1ZN",
  "pan": "AJKPG8543M",
  "bank_account_name": "Design Studio Sixteen",
  "bank_account_no": "0058107040000460",
  "bank_ifsc": "MSCI0082056",
  "bank_branch": "RANAPRATAP NAGAR",
  "currency_symbol": "₹",
  "currency_code": "INR"
}' WHERE key = 'company_branding';
```

---

## 8. Anti-Hallucination & Client Separation Rule

1. **Client Isolation**: `NEBE` is exclusively a client company (recorded in the `clients` table) and must **never** be used as the application owner, operator, corporate name, or branding identity.
2. **Platform Isolation**: `w4y` / `Workspace 4 You` is an external legacy platform and has zero affiliation with Design Studio 16. It must never appear in any code, configuration, database table, or report of DS16.
3. **Admin Identity**: User ID 1 is **Ar. Abhijit Gaulkar**, Principal Architect & Founder of Design Studio 16.
