"""
Zudent Attendance Analyzer — Vercel Serverless Entrypoint
Single-file FastAPI application, no cross-directory imports needed.
"""

import os
import math
import traceback
import tempfile
from typing import Dict, Any, List, Optional

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# ZUDENT API CLIENT (inline — no backend/ import needed)
# ---------------------------------------------------------------------------
SIGNIN_URL = "https://jwa0stlj67.execute-api.ap-south-1.amazonaws.com/prod/signin"
GRAPHQL_URL = "https://studentapi.rovelabs.com/graphql"

GQL_STUDENT_BY_EMAIL = """
query GetStudentByEmail($user_email: String!) {
  get_student_by_email(user_email: $user_email) {
    _id usn student_name user_email institution_name institution_short_name
    core_detail { current_term admission_year program_name stream }
  }
}
"""
GQL_COURSE_REG = """
query GetCourseRegByStudent($_id: String!) {
  get_course_reg_by_student(student_id: $_id) { term }
}
"""
GQL_STUDENT_COURSES = """
query GetStudentCourses($student_id: String!, $term: String!) {
  get_student_courses(student_id: $student_id, term: $term) {
    courses { course_reg_id course_code course_name course_type faculty_name total_cie }
  }
}
"""
GQL_ATTENDANCE = """
query StudentWiseAttendance($student_id: String!, $course_code: String!, $term: Int!, $app_name: String) {
  student_wise_attendance(student_id: $student_id course_code: $course_code term: $term app_name: $app_name) {
    classes_attended classes_held course_code course_name percentage_value disable_attendance_view
  }
}
"""


def calc_metrics(attended: int, held: int, custom_target: float = 75.0) -> Dict[str, Any]:
    if held == 0:
        empty = {"bunks_allowed": 0, "classes_needed": 0, "achieved": False, "message": "No classes yet."}
        return {"status": "No Classes", "status_color": "gray",
                "targets": {"75": empty, "85": empty, "custom": {**empty, "target": custom_target}}}

    curr = (attended / held) * 100

    def eval_t(tp: float) -> Dict:
        t = tp / 100.0
        if curr >= tp:
            bunks = max(0, math.floor((attended - t * held) / t)) if t > 0 else 0
            return {"target_percent": tp, "achieved": True, "bunks_allowed": bunks, "classes_needed": 0,
                    "message": f"Safe! You can miss {bunks} more class(es) and stay above {tp}%."}
        else:
            need = math.ceil(((t * held) - attended) / (1.0 - t)) if t < 1.0 else 9999
            return {"target_percent": tp, "achieved": False, "bunks_allowed": 0, "classes_needed": max(1, need),
                    "message": f"Attend {max(1, need)} consecutive class(es) to reach {tp}%."}

    if curr >= custom_target:
        status = "Healthy"
        color = "emerald"
    elif curr >= max(0.0, custom_target - 10.0):
        status = "Moderate"
        color = "amber"
    else:
        status = f"Critical (Below {int(max(0.0, custom_target - 10.0))}%)"
        color = "rose"
    return {"status": status, "status_color": color,
            "targets": {"75": eval_t(75.0), "85": eval_t(85.0), "custom": {**eval_t(custom_target), "target": custom_target}}}


async def graphql_query(id_token: str, query: str, variables: Optional[Dict] = None) -> Dict:
    headers = {
        "Authorization": id_token,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 ZudentAnalyzer/1.0"
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(GRAPHQL_URL, json={"query": query, "variables": variables or {}}, headers=headers)
        if resp.status_code != 200:
            raise ValueError(f"GraphQL HTTP {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        if "errors" in data and data["errors"]:
            raise ValueError("; ".join(e.get("message", "GraphQL error") for e in data["errors"]))
        return data.get("data", {})


async def fetch_attendance(email: str, password: str, target: float = 75.0) -> Dict[str, Any]:
    # 1. Sign in
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(SIGNIN_URL,
            json={"user_email": email.strip(), "password": password, "app_name": "student"},
            headers={"Content-Type": "application/json",
                     "User-Agent": "Mozilla/5.0 ZudentAnalyzer/1.0"})
        if r.status_code != 200:
            try:
                msg = r.json().get("message") or r.text
            except Exception:
                msg = r.text
            raise ValueError(f"Login failed: {msg}")
        auth = r.json()

    id_token = auth.get("id_token") or auth.get("access_token") or ""
    if not id_token:
        raise ValueError("Authentication succeeded but no access token was returned.")

    # 2. Student profile
    sd = await graphql_query(id_token, GQL_STUDENT_BY_EMAIL, {"user_email": email.strip()})
    student = sd.get("get_student_by_email")
    if not student:
        raise ValueError(f"No student record found for '{email}'.")

    student_id = student["_id"]
    core = student.get("core_detail") or {}
    current_term = core.get("current_term") or 1

    # 3. Terms
    try:
        td = await graphql_query(id_token, GQL_COURSE_REG, {"_id": str(student_id)})
        reg_terms = [t["term"] for t in (td.get("get_course_reg_by_student") or []) if t.get("term") is not None]
        if not reg_terms:
            reg_terms = [current_term]
    except Exception:
        reg_terms = [current_term]

    sel_term = current_term if current_term in reg_terms else reg_terms[0]

    # 4. Courses
    cd = await graphql_query(id_token, GQL_STUDENT_COURSES, {"student_id": str(student_id), "term": str(sel_term)})
    raw_courses = (cd.get("get_student_courses") or {}).get("courses") or []

    # 5. Attendance per course
    courses_out: List[Dict] = []
    total_att = total_held = 0

    for c in raw_courses:
        code = (c.get("course_code") or "").strip()
        try:
            ad = await graphql_query(id_token, GQL_ATTENDANCE, {
                "student_id": str(student_id), "course_code": code,
                "term": int(sel_term), "app_name": "student"
            })
            att_list = ad.get("student_wise_attendance") or []
            item = att_list[0] if att_list else {}
        except Exception:
            item = {}

        attended = int(item.get("classes_attended") or 0)
        held = int(item.get("classes_held") or 0)
        pct = round((attended / held * 100), 2) if held > 0 else 0.0
        total_att += attended
        total_held += held

        courses_out.append({
            "course_code": code,
            "course_name": (c.get("course_name") or "").strip(),
            "faculty_name": c.get("faculty_name") or "N/A",
            "course_type": c.get("course_type") or "theory",
            "classes_attended": attended,
            "classes_held": held,
            "classes_missed": max(0, held - attended),
            "attendance_fraction": f"{attended}/{held}",
            "exact_percentage": pct,
            "server_percentage": item.get("percentage_value"),
            "metrics": calc_metrics(attended, held, target)
        })

    overall_pct = round((total_att / total_held * 100), 2) if total_held > 0 else 0.0

    return {
        "student_profile": {
            "id": student_id,
            "name": student.get("student_name") or "Student",
            "usn": student.get("usn") or "N/A",
            "email": student.get("user_email") or email,
            "institution": student.get("institution_name") or student.get("institution_short_name") or "Institution",
            "program": core.get("program_name") or core.get("stream") or "Engineering",
            "current_term": sel_term,
            "available_terms": reg_terms
        },
        "overall_summary": {
            "total_attended": total_att,
            "total_held": total_held,
            "total_missed": max(0, total_held - total_att),
            "attendance_fraction": f"{total_att}/{total_held}",
            "overall_percentage": overall_pct,
            "metrics": calc_metrics(total_att, total_held, target),
            "total_courses": len(courses_out),
            "courses_below_75": sum(1 for c in courses_out if c["exact_percentage"] < 75 and c["classes_held"] > 0),
            "courses_below_85": sum(1 for c in courses_out if c["exact_percentage"] < 85 and c["classes_held"] > 0)
        },
        "courses": courses_out
    }

# ---------------------------------------------------------------------------
# FASTAPI APP
# ---------------------------------------------------------------------------
app = FastAPI(title="Zudent Attendance Analyzer", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

# Global error handler — always returns valid JSON
@app.exception_handler(Exception)
async def global_error(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(status_code=500,
                        content={"success": False, "detail": f"Server error: {str(exc)}"})

# Serve static frontend (Vercel serves public/ automatically; this is for local dev)
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_public = os.path.join(BASE, "public")
_frontend = os.path.join(BASE, "frontend")
FRONTEND = _public if os.path.exists(_public) else _frontend

try:
    if os.path.exists(FRONTEND):
        app.mount("/static", StaticFiles(directory=FRONTEND), name="static")
except Exception:
    pass


# ---------------------------------------------------------------------------
# MODELS
# ---------------------------------------------------------------------------
class AttendanceRequest(BaseModel):
    email: str
    password: str
    mode: str = "api"
    target: float = 75.0

class SimulationRequest(BaseModel):
    attended: int
    held: int
    upcoming_classes: int
    attended_upcoming: int
    target: float = 75.0


# ---------------------------------------------------------------------------
# ROUTES
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Zudent Attendance Analyzer"}

@app.post("/api/attendance")
async def attendance(req: AttendanceRequest):
    if not req.email or not req.password:
        return JSONResponse(status_code=400, content={"success": False, "detail": "Email and password required."})
    try:
        result = await fetch_attendance(req.email, req.password, float(req.target or 75.0))
        return JSONResponse(content={"success": True, "mode": "api", "data": result})
    except ValueError as e:
        return JSONResponse(status_code=400, content={"success": False, "detail": str(e)})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "detail": f"Unexpected error: {str(e)}"})

@app.post("/api/simulate")
async def simulate(req: SimulationRequest):
    new_att = req.attended + req.attended_upcoming
    new_held = req.held + req.upcoming_classes
    new_pct = round((new_att / new_held * 100), 2) if new_held > 0 else 0.0
    curr_pct = round((req.attended / req.held * 100), 2) if req.held > 0 else 0.0
    return {
        "current": {"attended": req.attended, "held": req.held, "percentage": curr_pct},
        "projected": {
            "attended": new_att, "held": new_held, "percentage": new_pct,
            "change": round(new_pct - curr_pct, 2),
            "metrics": calc_metrics(new_att, new_held, req.target)
        }
    }

@app.get("/")
async def index():
    idx = os.path.join(FRONTEND, "index.html")
    if os.path.exists(idx):
        return FileResponse(idx)
    return JSONResponse({"message": "Zudent Attendance Analyzer API is running."})

@app.get("/app.js")
async def serve_js():
    js = os.path.join(FRONTEND, "app.js")
    if os.path.exists(js):
        return FileResponse(js, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="app.js not found")
