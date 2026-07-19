import os

def _uploads_root():
    """Physical directory backing the /uploads mount and every file write in this app.

    On Azure App Service, the app's own directory (site/wwwroot, where this code
    lives) is replaced wholesale by a fresh deployment package on every push — any
    file written there during a request is gone by the next deploy, even though it
    looks "saved" until then. /home itself is separate, durable Azure Files storage
    that isn't part of that package swap, so store there instead when running on
    App Service. Locally (no WEBSITE_SITE_NAME) this is unchanged.
    """
    if os.environ.get("WEBSITE_SITE_NAME"):
        return "/home/uploads"
    return os.path.join(os.path.dirname(__file__), "..", "uploads")

UPLOADS_DIR = _uploads_root()
os.makedirs(UPLOADS_DIR, exist_ok=True)
