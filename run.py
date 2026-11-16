import uvicorn
import os

if __name__ == "__main__":
    print("=" * 60)
    print("   Starting Zudent Attendance Analyzer Web App")
    print("   Target Portal: https://zudent.rovelabs.com/login")
    print("   Local Server: http://localhost:8000")
    print("=" * 60)
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False)

