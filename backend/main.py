import os
import math
import tempfile
import traceback
from typing import Optional
from fastapi import FastAPI, HTTPException, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from backend.zudent_api import ZudentClient
from backend.browser_scraper import ZudentBrowserScraper

app = FastAPI(
    title="Zudent Attendance Analyzer",
    description="Automated Attendance Analyzer and Percentage Calculator for Zudent RoveLabs",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global JSON Exception Handler (ensures response is always valid JSON)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"success": False, "detail": f"Server error: {str(exc)}"}
    )

# Safe directory resolution (read-only filesystem safe for Vercel/Lambda)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
FRONTEND_DIR = PUBLIC_DIR if os.path.exists(PUBLIC_DIR) else os.path.join(BASE_DIR, "frontend")

try:
    SCREENSHOTS_DIR = os.path.join(tempfile.gettempdir(), "screenshots")
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
except Exception:
    SCREENSHOTS_DIR = None

if os.path.exists(FRONTEND_DIR):
    try:
        app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
    except Exception:
        pass

class AttendanceRequest(BaseModel):
    email: str = Field(..., description="Zudent student email")
    password: str = Field(..., description="Zudent student password")
    mode: str = Field("api", description="'api' for instant GraphQL API, 'browser' for Playwright browser automation")
    target: float = Field(75.0, description="Target percentage for bunks/recovery calculations")

class SimulationRequest(BaseModel):
    attended: int
    held: int
    upcoming_classes: int
    attended_upcoming: int
    target: float = 75.0

# Router for attendance logic (mounted at both /api and root for Vercel rewrite compatibility)
api_router = APIRouter()

@api_router.get("/health")
async def health_check():
    return {"status": "ok", "service": "Zudent Attendance Analyzer"}

@api_router.post("/attendance")
async def get_attendance(req: AttendanceRequest):
    if not req.email or not req.password:
        return JSONResponse(
            status_code=400,
            content={"success": False, "detail": "Email and password are required."}
        )

    mode = (req.mode or "api").lower().strip()
    target = float(req.target) if req.target else 75.0

    try:
        if mode == "browser":
            scraper = ZudentBrowserScraper(headless=True)
            result = await scraper.scrape_attendance(
                email=req.email,
                password=req.password,
                custom_target=target,
                screenshot_dir=SCREENSHOTS_DIR
            )
            return JSONResponse(content={"success": True, "mode": "browser", "data": result})
        else:
            # Default to High-Performance Direct API Client
            client = ZudentClient()
            result = await client.fetch_full_attendance(
                email=req.email,
                password=req.password,
                custom_target=target
            )
            return JSONResponse(content={"success": True, "mode": "api", "data": result})
    except ValueError as ve:
        return JSONResponse(
            status_code=400,
            content={"success": False, "detail": str(ve)}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": f"Failed to retrieve attendance: {str(e)}"}
        )

@api_router.post("/simulate")
async def simulate_attendance(req: SimulationRequest):
    new_attended = req.attended + req.attended_upcoming
    new_held = req.held + req.upcoming_classes
    new_pct = round((new_attended / new_held) * 100, 2) if new_held > 0 else 0.0

    metrics = ZudentClient.calculate_attendance_metrics(new_attended, new_held, req.target)

    return {
        "current": {
            "attended": req.attended,
            "held": req.held,
            "percentage": round((req.attended / req.held) * 100, 2) if req.held > 0 else 0.0
        },
        "projected": {
            "attended": new_attended,
            "held": new_held,
            "percentage": new_pct,
            "change": round(new_pct - ((req.attended / req.held * 100) if req.held > 0 else 0.0), 2),
            "metrics": metrics
        }
    }

# Register under both /api and root prefix
app.include_router(api_router, prefix="/api")
app.include_router(api_router, prefix="")

# Static UI serving for local testing
@app.get("/")
async def serve_index():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Frontend index.html not found"}

@app.get("/app.js")
async def serve_app_js():
    js_file = os.path.join(FRONTEND_DIR, "app.js")
    if os.path.exists(js_file):
        return FileResponse(js_file, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="app.js not found")
