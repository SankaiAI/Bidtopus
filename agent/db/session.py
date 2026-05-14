"""FastAPI session dependency.

Import get_db from here in route handlers:

    from agent.db.session import get_db

    @router.post("/underwrite")
    def underwrite(body: ..., db: Session = Depends(get_db)):
        ...
"""
from db.base import get_db_dependency as get_db

__all__ = ["get_db"]
