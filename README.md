```
python -m venv .venv
source .venv/bin/activate

cd backend
pip install -r requirements.txt
pip install -e "/src/lerobot-act/[feetechmks]"

uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```