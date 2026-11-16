"""
Zudent / RoveLabs API Client
Provides direct, authenticated access to the Zudent AWS AppSync GraphQL backend
and authentication microservice.
"""

import math
from typing import Dict, Any, List, Optional
import httpx

SIGNIN_URL = "https://jwa0stlj67.execute-api.ap-south-1.amazonaws.com/prod/signin"
GRAPHQL_URL = "https://studentapi.rovelabs.com/graphql"

GQL_GET_STUDENT_BY_EMAIL = """
query GetStudentByEmail($user_email: String!) {
  get_student_by_email(user_email: $user_email) {
    _id
    usn
    student_name
    user_email
    personal_email
    institution_name
    institution_short_name
    organization_name
    core_detail {
      current_term
      admission_year
      program_name
      stream
      admission_type
      fee_batch
    }
  }
}
"""

GQL_GET_COURSE_REG_BY_STUDENT = """
query GetCourseRegByStudent($_id: String!) {
  get_course_reg_by_student(student_id: $_id) {
    term
  }
}
"""

GQL_GET_STUDENT_COURSES = """
query GetStudentCourses($student_id: String!, $term: String!) {
  get_student_courses(student_id: $student_id, term: $term) {
    courses {
      course_reg_id
      course_code
      course_name
      course_type
      faculty_name
      total_cie
    }
  }
}
"""

GQL_GET_COURSE_BY_ID = """
query GetCourseById($_id: String!) {
  get_course_by_id(_id: $_id) {
    _id
    program
    academic_year
    section
    term
  }
}
"""

GQL_STUDENT_WISE_ATTENDANCE = """
query StudentWiseAttendance($student_id: String!, $course_code: String!, $term: Int!, $app_name: String) {
  student_wise_attendance(
    student_id: $student_id
    course_code: $course_code
    term: $term
    app_name: $app_name
  ) {
    classes_attended
    classes_held
    course_code
    course_name
    percentage_value
    disable_attendance_view
  }
}
"""

GQL_STUDENT_WISE_ATTENDANCE_DETAILED = """
query StudentWiseAttendanceDetailed($student_id: String!, $term: Int!, $course_code: String!) {
  student_wise_attendance_detailed(
    student_id: $student_id
    course_code: $course_code
    term: $term
  ) {
    class_date
    start_time
    end_time
    courses {
      course_code
      attended
    }
  }
}
"""


class ZudentClient:
    def __init__(self, timeout: float = 20.0):
        self.timeout = timeout

    async def sign_in(self, email: str, password: str) -> Dict[str, Any]:
        """
        Authenticate against Zudent Cognito microservice.
        Returns tokens dict containing access_token, id_token, refresh_token.
        """
        payload = {
            "user_email": email.strip(),
            "password": password,
            "app_name": "student"
        }
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(SIGNIN_URL, json=payload, headers=headers)
            if resp.status_code != 200:
                try:
                    err_json = resp.json()
                    msg = err_json.get("message") or err_json.get("error") or resp.text
                except Exception:
                    msg = resp.text
                raise ValueError(f"Login failed (HTTP {resp.status_code}): {msg}")
            
            data = resp.json()
            # Token validation
            id_token = data.get("id_token") or data.get("accessToken") or data.get("access_token")
            if not id_token:
                raise ValueError("Authentication response did not contain a valid security token.")
            return data

    async def _graphql_query(self, id_token: str, query: str, variables: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Execute a GraphQL query on AppSync endpoint with Cognito idToken."""
        headers = {
            "Authorization": id_token,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        payload = {
            "query": query,
            "variables": variables or {}
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(GRAPHQL_URL, json=payload, headers=headers)
            if resp.status_code != 200:
                raise ValueError(f"GraphQL request error (HTTP {resp.status_code}): {resp.text}")
            
            data = resp.json()
            if "errors" in data and data["errors"]:
                err_msg = "; ".join([e.get("message", "Unknown GraphQL error") for e in data["errors"]])
                raise ValueError(f"GraphQL error: {err_msg}")
            return data.get("data", {})

    async def fetch_full_attendance(self, email: str, password: str, custom_target: float = 75.0) -> Dict[str, Any]:
        """
        Orchestrates full student data retrieval:
        1. Login -> tokens
        2. Student profile -> student_id, USN, current_term
        3. Course registration -> available terms
        4. Enrolled courses for current term
        5. For each course -> attendance numbers (xx/xx), accurate percentages, bunks allowed / needed.
        """
        auth_data = await self.sign_in(email, password)
        id_token = auth_data.get("id_token") or auth_data.get("access_token")

        # 1. Fetch Student Profile
        student_res = await self._graphql_query(
            id_token,
            GQL_GET_STUDENT_BY_EMAIL,
            {"user_email": email.strip()}
        )
        student = student_res.get("get_student_by_email")
        if not student:
            raise ValueError(f"No student record found associated with '{email}'.")
        
        student_id = student.get("_id")
        core_detail = student.get("core_detail") or {}
        current_term = core_detail.get("current_term") or 1
        
        # 2. Fetch Available Terms
        try:
            terms_res = await self._graphql_query(
                id_token,
                GQL_GET_COURSE_REG_BY_STUDENT,
                {"_id": str(student_id)}
            )
            reg_terms = [t.get("term") for t in (terms_res.get("get_course_reg_by_student") or []) if t.get("term") is not None]
            if not reg_terms:
                reg_terms = [current_term]
        except Exception:
            reg_terms = [current_term]

        # Use current term or latest term
        selected_term = current_term if current_term in reg_terms else reg_terms[0]

        # 3. Fetch Registered Courses
        courses_res = await self._graphql_query(
            id_token,
            GQL_GET_STUDENT_COURSES,
            {"student_id": str(student_id), "term": str(selected_term)}
        )
        student_courses_obj = courses_res.get("get_student_courses") or {}
        raw_courses = student_courses_obj.get("courses") or []

        # 4. Fetch Attendance for Each Course
        courses_attendance: List[Dict[str, Any]] = []
        total_attended_all = 0
        total_held_all = 0

        for course in raw_courses:
            course_code = course.get("course_code", "").strip()
            course_name = course.get("course_name", "").strip()
            course_reg_id = course.get("course_reg_id", "")
            faculty_name = course.get("faculty_name", "N/A")
            course_type = course.get("course_type", "theory")

            # Default values
            classes_attended = 0
            classes_held = 0
            server_percentage = None
            disable_view = False
            detailed_classes: List[Dict[str, Any]] = []

            # Query attendance
            try:
                att_res = await self._graphql_query(
                    id_token,
                    GQL_STUDENT_WISE_ATTENDANCE,
                    {
                        "student_id": str(student_id),
                        "course_code": course_code,
                        "term": int(selected_term),
                        "app_name": "student"
                    }
                )
                att_list = att_res.get("student_wise_attendance") or []
                if att_list:
                    item = att_list[0]
                    classes_attended = int(item.get("classes_attended") or 0)
                    classes_held = int(item.get("classes_held") or 0)
                    server_percentage = item.get("percentage_value")
                    disable_view = bool(item.get("disable_attendance_view", False))
            except Exception as e:
                print(f"Warning: Failed to fetch summary attendance for {course_code}: {e}")

            # Try to fetch detailed log
            try:
                detailed_res = await self._graphql_query(
                    id_token,
                    GQL_STUDENT_WISE_ATTENDANCE_DETAILED,
                    {
                        "student_id": str(student_id),
                        "course_code": course_code,
                        "term": int(selected_term)
                    }
                )
                detailed_list = detailed_res.get("student_wise_attendance_detailed") or []
                for entry in detailed_list:
                    c_info = next((c for c in (entry.get("courses") or []) if c.get("course_code") == course_code), None)
                    if c_info:
                        detailed_classes.append({
                            "date": entry.get("class_date"),
                            "start_time": entry.get("start_time"),
                            "end_time": entry.get("end_time"),
                            "attended": bool(c_info.get("attended"))
                        })
            except Exception:
                pass

            # Calculate mathematically accurate percentage
            if classes_held > 0:
                exact_percentage = round((classes_attended / classes_held) * 100, 2)
            else:
                exact_percentage = 0.0

            classes_missed = max(0, classes_held - classes_attended)
            total_attended_all += classes_attended
            total_held_all += classes_held

            # Calculate target analytics for 75%, 85%, and custom_target
            analysis = self.calculate_attendance_metrics(classes_attended, classes_held, custom_target)

            courses_attendance.append({
                "course_code": course_code,
                "course_name": course_name,
                "course_reg_id": course_reg_id,
                "faculty_name": faculty_name,
                "course_type": course_type,
                "classes_attended": classes_attended,
                "classes_held": classes_held,
                "classes_missed": classes_missed,
                "attendance_fraction": f"{classes_attended}/{classes_held}",
                "exact_percentage": exact_percentage,
                "server_percentage": server_percentage,
                "disable_view": disable_view,
                "metrics": analysis,
                "detailed_history": detailed_classes
            })

        # Overall summary
        overall_percentage = round((total_attended_all / total_held_all * 100), 2) if total_held_all > 0 else 0.0
        overall_analysis = self.calculate_attendance_metrics(total_attended_all, total_held_all, custom_target)

        return {
            "student_profile": {
                "id": student_id,
                "name": student.get("student_name", "Student"),
                "usn": student.get("usn", "N/A"),
                "email": student.get("user_email") or email,
                "institution": student.get("institution_name") or student.get("institution_short_name") or "Institution",
                "program": core_detail.get("program_name") or core_detail.get("stream") or "Engineering",
                "current_term": selected_term,
                "available_terms": reg_terms
            },
            "overall_summary": {
                "total_attended": total_attended_all,
                "total_held": total_held_all,
                "total_missed": max(0, total_held_all - total_attended_all),
                "attendance_fraction": f"{total_attended_all}/{total_held_all}",
                "overall_percentage": overall_percentage,
                "metrics": overall_analysis,
                "total_courses": len(courses_attendance),
                "courses_below_75": sum(1 for c in courses_attendance if c["exact_percentage"] < 75.0 and c["classes_held"] > 0),
                "courses_below_85": sum(1 for c in courses_attendance if c["exact_percentage"] < 85.0 and c["classes_held"] > 0)
            },
            "courses": courses_attendance
        }

    @staticmethod
    def calculate_attendance_metrics(attended: int, held: int, custom_target: float = 75.0) -> Dict[str, Any]:
        """
        Calculates:
        1. Bunks allowed while maintaining target %
        2. Classes required to attend to reach target %
        for 75%, 85%, and custom target.
        """
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
                # Can bunk future classes
                # (attended) / (held + B) >= t  =>  B <= (attended - t * held) / t
                bunks = math.floor((attended - (t * held)) / t) if t > 0 else 0
                return {
                    "target_percent": target_pct,
                    "achieved": True,
                    "bunks_allowed": max(0, bunks),
                    "classes_needed": 0,
                    "message": f"Safe! You can miss {max(0, bunks)} more class(es) and remain at or above {target_pct}%."
                }
            else:
                # Must attend upcoming classes
                # (attended + C) / (held + C) >= t => C >= (t * held - attended) / (1 - t)
                if t >= 1.0:
                    classes_req = 9999
                else:
                    classes_req = math.ceil(((t * held) - attended) / (1.0 - t))
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

        if curr_pct >= custom_target:
            status = "Healthy"
            status_color = "emerald"
        elif curr_pct >= max(0.0, custom_target - 10.0):
            status = "Moderate"
            status_color = "amber"
        else:
            status = f"Critical (Below {int(max(0.0, custom_target - 10.0))}%)"
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

