from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))


def today_ist():
    """Current calendar date in IST — independent of the server's own system timezone.
    Use this anywhere `date.today()` was standing in for "today's date for the business"
    (task due dates, received/purchase dates). Render's server clock is UTC, so a bare
    date.today() shows yesterday's date between 12:00-5:30am IST."""
    return datetime.now(IST).date()
