# Zudent Attendance Analyzer & Accurate Percentage Calculator

A dedicated web application that automates logging into **[Zudent RoveLabs](https://zudent.rovelabs.com/login)** with student credentials, navigating to the Courses / Academics section, reading the live attendance records (`classes_attended / classes_held`, e.g. `24/28`), and computing mathematically accurate percentages, safe bunk allowances, and minimum recovery classes.

---

## Key Features

1. **Dual Execution Engine**:
   - ⚡ **Direct API Mode (Default & Blazing Fast ~1.2s)**: Communicates directly with Zudent's AWS Cognito authentication and AWS AppSync GraphQL microservices (`studentapi.rovelabs.com`). Instant, lightweight, and 100% reliable without browser overhead.
   - 🌐 **Browser Automation Mode (Playwright)**: Launches a Chromium browser instance, navigates to `https://zudent.rovelabs.com/login`, enters your email & password, submits, and scrapes the live `/app/admin/academics` courses section.
2. **Accurate Mathematical Percentages**:
   - Calculates exact attendance:
     $$\text{Exact Percentage} = \frac{\text{classes\_attended}}{\text{classes\_held}} \times 100\%$$
   - Displays accurate 2-decimal percentages alongside the raw `attended/held` fractions.
3. **Bunk / Margin Calculator**:
   - **When Attendance $\ge \text{Target}$ (e.g. 75% or 85%)**:
     Calculates how many consecutive future classes you can safely miss without falling below your target:
     $$B = \left\lfloor \frac{\text{attended} - (\text{target} \times \text{held})}{\text{target}} \right\rfloor$$
   - **When Attendance $< \text{Target}$**:
     Calculates how many consecutive upcoming classes you must attend to recover:
     $$C = \left\lceil \frac{(\text{target} \times \text{held}) - \text{attended}}{1 - \text{target}} \right\rceil$$
4. **Interactive "What-If" Simulator**:
   - Allows students to simulate upcoming schedules: *"If 10 more classes occur and I attend 8, what will my overall or subject percentage be?"*
5. **Modern, Responsive Web UI**:
   - Built with Tailwind CSS, clean glassmorphism cards, status badges, course filters, and a print-ready report layout.
   - Demo Data button to preview dashboard layout without needing immediate login credentials.

---

## Project Structure

```
Attendence/
├── backend/
│   ├── main.py              # FastAPI application server and API endpoints
│   ├── zudent_api.py        # Zudent AWS Cognito & AppSync GraphQL client
│   └── browser_scraper.py   # Playwright Chromium browser scraper
├── frontend/
│   ├── index.html           # Modern responsive dashboard UI
│   ├── app.js               # Frontend controller, state & simulation engine
│   └── screenshots/         # Directory for browser automation captures
├── run.py                   # Server entrypoint
├── start.bat                # Windows one-click startup launcher
└── requirements.txt         # Python dependencies
```

---

## How to Run

### Quick Start (Windows)
Double-click `start.bat` or run in terminal:
```powershell
.\start.bat
```

### Manual Start
1. Activate virtual environment:
   ```powershell
   .\.venv\Scripts\activate
   ```
2. Start the FastAPI server:
   ```powershell
   python run.py
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

---

## Security & Privacy
- Credentials entered in the application are sent directly to the official Zudent AWS Cognito endpoint (`https://jwa0stlj67.execute-api.ap-south-1.amazonaws.com/prod/signin`) and are never saved or transmitted elsewhere.

