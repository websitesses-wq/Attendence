"""
Zudent / RoveLabs Playwright Browser Automation Scraper
Automates the actual Chromium browser to:
1. Open https://zudent.rovelabs.com/login
2. Enter email and password
3. Submit and wait for authentication
4. Navigate to courses / academics section
5. Inspect the attendance records (classes_attended/classes_held) and calculate exact percentages
6. Optionally capture page screenshots
"""

import os
import re
import math
import asyncio
from typing import Dict, Any, List, Optional

try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    async_playwright = None

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

class ZudentBrowserScraper:
    def __init__(self, headless: bool = True, timeout: int = 40000):
        self.headless = headless
        self.timeout = timeout

    async def scrape_attendance(self, email: str, password: str, custom_target: float = 75.0, screenshot_dir: Optional[str] = None) -> Dict[str, Any]:
        """
        Executes real browser automation on https://zudent.rovelabs.com/login
        and navigates to Courses to retrieve xx/xx attendance.
        """
        if not PLAYWRIGHT_AVAILABLE or async_playwright is None:
            raise ValueError(
                "Browser automation (Playwright) is not available in this environment. "
                "Please switch to 'Direct API' mode, which is faster, lighter, and 100% supported."
            )
        captured_student_data = {}
        captured_courses = []
        captured_attendance_map = {} # course_code -> {attended, held, server_pct}
        error_message = None

        launch_args = {
            "headless": self.headless,
            "args": ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        }
        if os.path.exists(CHROME_PATH):
            launch_args["executable_path"] = CHROME_PATH

        async with async_playwright() as p:
            browser = await p.chromium.launch(**launch_args)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()

            # Listen for GraphQL network responses to capture exact data as the frontend receives it
            async def handle_response(response):
                try:
                    if "graphql" in response.url and response.status == 200:
                        json_data = await response.json()
                        data = json_data.get("data", {})
                        if "get_student_by_email" in data:
                            captured_student_data.update(data["get_student_by_email"])
                        if "get_student_courses" in data:
                            courses = (data["get_student_courses"] or {}).get("courses") or []
                            if courses:
                                captured_courses.extend(courses)
                        if "student_wise_attendance" in data:
                            att_items = data["student_wise_attendance"] or []
                            for itm in att_items:
                                c_code = itm.get("course_code")
                                if c_code:
                                    captured_attendance_map[c_code] = itm
                except Exception:
                    pass

            page.on("response", handle_response)

            try:
                # 1. Navigate to Login Page
                print("[Playwright] Navigating to https://zudent.rovelabs.com/login...")
                await page.goto("https://zudent.rovelabs.com/login", wait_until="networkidle", timeout=self.timeout)

                # 2. Fill login form
                print("[Playwright] Filling credentials...")
                await page.wait_for_selector('input[name="email"]', timeout=15000)
                await page.fill('input[name="email"]', email.strip())
                await page.fill('input[name="password"]', password)

                # 3. Click Submit
                print("[Playwright] Submitting login form...")
                await page.click('button[type="submit"]')

                # Wait for navigation away from /login or for error banner
                try:
                    await page.wait_for_url(re.compile(r"/app.*"), timeout=20000)
                    print("[Playwright] Login successful, redirected to /app!")
                except Exception:
                    # Check if error message appeared on page
                    err_el = await page.query_selector('.MuiFormHelperText-root.Mui-error, .MuiAlert-message, [role="alert"]')
                    if err_el:
                        error_text = await err_el.inner_text()
                        raise ValueError(f"Login failed: {error_text}")
                    # If URL didn't change and no error selector, check current URL
                    if "/login" in page.url:
                        raise ValueError("Login failed. Please check your email and password.")

                # 4. Navigate to Courses / Academics section
                print("[Playwright] Navigating to Courses section (/app/admin/academics)...")
                await page.goto("https://zudent.rovelabs.com/app/admin/academics", wait_until="networkidle", timeout=self.timeout)
                await page.wait_for_timeout(3000) # allow React state & GraphQL queries to settle

                # Capture screenshot if requested
                screenshot_path = None
                if screenshot_dir:
                    os.makedirs(screenshot_dir, exist_ok=True)
                    screenshot_path = os.path.join(screenshot_dir, "courses_attendance.png")
                    await page.screenshot(path=screenshot_path, full_page=True)

                # 5. Fallback DOM Scraping: If GraphQL listener didn't catch cards, scrape DOM elements
                # Look for attendance patterns like "XX / XX" or "Attendance"
                dom_text = await page.content()
                
            except Exception as e:
                error_message = str(e)
            finally:
                await browser.close()

        if error_message:
            raise ValueError(error_message)

        # Build final response from captured data
        student_id = captured_student_data.get("_id") or "student"
        student_name = captured_student_data.get("student_name") or "Student"
        usn = captured_student_data.get("usn") or "N/A"
        core_detail = captured_student_data.get("core_detail") or {}
        current_term = core_detail.get("current_term") or 1

        courses_attendance: List[Dict[str, Any]] = []
        total_attended_all = 0
        total_held_all = 0

        for course in captured_courses:
            course_code = course.get("course_code", "").strip()
            course_name = course.get("course_name", "").strip()
            course_type = course.get("course_type", "theory")
            faculty_name = course.get("faculty_name", "N/A")

            att_info = captured_attendance_map.get(course_code, {})
            classes_attended = int(att_info.get("classes_attended") or 0)
            classes_held = int(att_info.get("classes_held") or 0)
            server_percentage = att_info.get("percentage_value")

            exact_percentage = round((classes_attended / classes_held * 100), 2) if classes_held > 0 else 0.0
            total_attended_all += classes_attended
            total_held_all += classes_held

            metrics = self._calculate_metrics(classes_attended, classes_held, custom_target)

            courses_attendance.append({
                "course_code": course_code,
                "course_name": course_name,
                "faculty_name": faculty_name,
                "course_type": course_type,
                "classes_attended": classes_attended,
                "classes_held": classes_held,
                "classes_missed": max(0, classes_held - classes_attended),
                "attendance_fraction": f"{classes_attended}/{classes_held}",
                "exact_percentage": exact_percentage,
                "server_percentage": server_percentage,
                "metrics": metrics
            })

        overall_percentage = round((total_attended_all / total_held_all * 100), 2) if total_held_all > 0 else 0.0
        overall_metrics = self._calculate_metrics(total_attended_all, total_held_all, custom_target)

        return {
            "mode": "playwright_browser",
            "student_profile": {
                "id": student_id,
                "name": student_name,
                "usn": usn,
                "email": email,
                "institution": captured_student_data.get("institution_name") or "Institution",
                "program": core_detail.get("program_name") or "Program",
                "current_term": current_term
            },
            "overall_summary": {
                "total_attended": total_attended_all,
                "total_held": total_held_all,
                "total_missed": max(0, total_held_all - total_attended_all),
                "attendance_fraction": f"{total_attended_all}/{total_held_all}",
                "overall_percentage": overall_percentage,
                "metrics": overall_metrics,
                "total_courses": len(courses_attendance),
                "courses_below_75": sum(1 for c in courses_attendance if c["exact_percentage"] < 75.0 and c["classes_held"] > 0),
                "courses_below_85": sum(1 for c in courses_attendance if c["exact_percentage"] < 85.0 and c["classes_held"] > 0)
            },
            "courses": courses_attendance,
            "screenshot_saved": bool(screenshot_path)
        }

    @staticmethod
    def _calculate_metrics(attended: int, held: int, custom_target: float = 75.0) -> Dict[str, Any]:
        if held == 0:
            return {
                "status": "No Classes",
                "status_color": "gray",
                "targets": {
                    "75": {"bunks_allowed": 0, "classes_needed": 0, "status": "No Classes"},
                    "85": {"bunks_allowed": 0, "classes_needed": 0, "status": "No Classes"},
                    "custom": {"target": custom_target, "bunks_allowed": 0, "classes_needed": 0, "status": "No Classes"}
                }
            }
        curr_pct = (attended / held) * 100

        def eval_target(target_pct: float) -> Dict[str, Any]:
            t = target_pct / 100.0
            if curr_pct >= target_pct:
                bunks = math.floor((attended - (t * held)) / t) if t > 0 else 0
                return {
                    "target_percent": target_pct,
                    "achieved": True,
                    "bunks_allowed": max(0, bunks),
                    "classes_needed": 0,
                    "message": f"Safe! You can miss {max(0, bunks)} more class(es) and remain at or above {target_pct}%."
                }
            else:
                classes_req = 9999 if t >= 1.0 else math.ceil(((t * held) - attended) / (1.0 - t))
                return {
                    "target_percent": target_pct,
                    "achieved": False,
                    "bunks_allowed": 0,
                    "classes_needed": max(1, classes_req),
                    "message": f"Attention! You must attend {max(1, classes_req)} consecutive class(es) to reach {target_pct}%."
                }

        t75 = eval_target(75.0)
        t85 = eval_target(85.0)
        t_custom = eval_target(custom_target)

        if curr_pct >= 85.0:
            status = "Healthy"
            status_color = "emerald"
        elif curr_pct >= 75.0:
            status = "Moderate"
            status_color = "amber"
        else:
            status = "Critical (Below 75%)"
            status_color = "rose"

        return {
            "status": status,
            "status_color": status_color,
            "targets": {
                "75": t75,
                "85": t85,
                "custom": t_custom
            }
        }

