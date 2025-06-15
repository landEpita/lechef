This repo is our projet for the global LeRobot's hackathon. We updated the SO100 arm to use it on a rail (thanks to an aditionnal motor). We changed LeRobot original repo to train the ACT with onehot vectors inputs (for training different task in one model) and with new rail motor position inputs.
With this new ACT you can choose (by entering a onehot vector) which task you want to run in the inference. Furthemore, the model wil predict the SO100 arm motors and the rail motor positions.

After cloning you should activate the submodules to has the modifier repo LeRobot (for training ACT with rail motor and using the rail motor with the SO100 Arm)

```
git submodule update --init --recursive
```

And to run the code.

```
python -m venv .venv
source .venv/bin/activate

cd backend
pip install -r requirements.txt
pip install -e "/src/lerobot-act/[feetechmks]"

uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```