import logging
import os
import time
from dataclasses import asdict, dataclass
from pprint import pformat
import numpy as np
import random
import shutil
import rerun as rr

# from safetensors.torch import load_file, save_file
from lerobot-mks.lerobot.common.datasets.lerobot_dataset import LeRobotDataset
from lerobot-mks.lerobot.common.policies.factory import make_policy
from lerobot-mks.lerobot.common.robot_devices.control_configs import (
    RecordControlConfig,
    TeleoperateControlConfig,
)
from lerobot-mks.lerobot.common.robot_devices.control_utils import (
    control_loop,
    sanity_check_dataset_name,
    warmup_record,
    init_keyboard_listener,
    predict_action,
)
from lerobot-mks.lerobot.common.robot_devices.robots.configs import (
    FeetechMotorsBusConfig,
    OpenCVCameraConfig,
    So100RobotConfig,
)
from lerobot-mks.lerobot.common.robot_devices.robots.configs import So100RobotConfig
from lerobot-mks.lerobot.common.robot_devices.utils import busy_wait
from lerobot-mks.lerobot.common.utils.utils import get_safe_torch_device
from lerobot-mks.lerobot.common.robot_devices.robots.utils import Robot, make_robot_from_config
from lerobot-mks.lerobot.common.robot_devices.utils import safe_disconnect
from lerobot-mks.lerobot.common.policies.act.configuration_act import (
    ACTConfig,
    NormalizationMode,
)
from lerobot-mks.lerobot.configs.types import PolicyFeature, FeatureType

import shutil
import torch


########################################################################################
# Control modes
########################################################################################

@safe_disconnect
def teleoperate(robot: Robot, cfg: TeleoperateControlConfig):
    control_loop(
        robot,
        control_time_s=cfg.teleop_time_s,
        fps=cfg.fps,
        teleoperate=True,
        display_data=cfg.display_data,
    )


@dataclass
class Config:
    robot: So100RobotConfig
    control: RecordControlConfig

@safe_disconnect
def record(
    robot: Robot,
    cfg: RecordControlConfig,
    index:int,
    onehot_task: list[int],
) -> LeRobotDataset:
    cfg.repo_id = cfg.repo_id + "_" + str(index)
    # Create empty dataset or load existing saved episodes
    sanity_check_dataset_name(cfg.repo_id, cfg.policy)
    dataset = LeRobotDataset.create(
        cfg.repo_id,
        cfg.fps,
        root=cfg.root,
        robot=robot,
        use_videos=cfg.video,
        image_writer_processes=cfg.num_image_writer_processes,
        image_writer_threads=cfg.num_image_writer_threads_per_camera * len(robot.cameras),
    )

    # Load pretrained policy
    policy = None if cfg.policy is None else make_policy(cfg.policy, ds_meta=dataset.meta)

    if not robot.is_connected:
        robot.connect()

    # Interpolate between current position and goal position 
    # observation = robot.capture_observation()
    # print(observation)
    # current_position = observation["observation.state"].cpu().numpy()
    # robot.send_action(torch.tensor([current_position[0], 135, 135, 4, -90, 3]))
    # time.sleep(0.5)
    # robot.send_action(torch.tensor([0, 135, 135, 4, -90, 3]))

    listener, events = init_keyboard_listener()

    # Execute a few seconds without recording to:
    # 1. teleoperate the robot to move it in starting position if no policy provided,
    # 2. give times to the robot devices to connect and start synchronizing,
    # 3. place the cameras windows on screen
    enable_teleoperation = policy is None
    warmup_record(robot, None, enable_teleoperation, cfg.warmup_time_s, cfg.display_data, cfg.fps)

    control_time_s = cfg.episode_time_s
    #while True:
    onehot_task = torch.tensor(onehot_task, dtype=torch.float)
    if not robot.is_connected:
        robot.connect()

    if control_time_s is None:
        control_time_s = float("inf")

    if dataset is not None and cfg.fps is not None and dataset.fps != cfg.fps:
        raise ValueError(f"The dataset fps should be equal to requested fps ({dataset['fps']} != {cfg.fps}).")
    
    timestamp = 0
    start_episode_t = time.perf_counter()
    while timestamp < control_time_s:
        start_loop_t = time.perf_counter()
        
        observation = robot.capture_observation()
        observation["onehot_task"] = onehot_task
        if policy is not None:
            pred_action = predict_action(
                observation, policy, get_safe_torch_device(policy.config.device), policy.config.use_amp
            )
            # Action can eventually be clipped using `max_relative_target`,
            # so action actually sent is saved in the dataset.
            action = robot.send_action(pred_action)
            action = {"action": action}

        if cfg.fps is not None:
            dt_s = time.perf_counter() - start_loop_t
            busy_wait(1 / cfg.fps - dt_s)

        dt_s = time.perf_counter() - start_loop_t
        timestamp = time.perf_counter() - start_episode_t
    print("Finished recording trajectory")


@dataclass
class Config_dummy():
    robot: So100RobotConfig
    control: RecordControlConfig

def control_robot(
    onehot_task: list[int],
    index: int,
):
    # TODO : fix the call to config here 
    cfg = Config_dummy(
        robot=So100RobotConfig(
            leader_arms={
                'right': FeetechMotorsBusConfig(
                    port="/dev/tty.usbmodem58FD0162241",
                    motors={
                        'shoulder_pan': [1, 'sts3215'],
                        'shoulder_lift': [2, 'sts3215'],
                        'elbow_flex': [3, 'sts3215'],
                        'wrist_flex': [4, 'sts3215'],
                        'wrist_roll': [5, 'sts3215'],
                        'gripper': [6, 'sts3215']
                    },
                    mock=False
                )
            },
            follower_arms={
                'right': FeetechMotorsBusConfig(
                    port="/dev/tty.usbmodem58FD0172321",
                    motors={
                        'shoulder_pan': [1, 'sts3215'],
                        'shoulder_lift': [2, 'sts3215'],
                        'elbow_flex': [3, 'sts3215'],
                        'wrist_flex': [4, 'sts3215'],
                        'wrist_roll': [5, 'sts3215'],
                        'gripper': [6, 'sts3215']
                    },
                    mock=False
                )
            },
            cameras={
                'webcam': OpenCVCameraConfig(
                    camera_index=0,
                    fps=30,
                    width=640,
                    height=480,
                    color_mode='rgb',
                    channels=3,
                    rotation=None,
                    mock=False
                ),
                'camD': OpenCVCameraConfig(
                    camera_index=1,
                    fps=30,
                    width=640,
                    height=480,
                    color_mode='rgb',
                    channels=3,
                    rotation=None,
                    mock=False
                )
            },
            max_relative_target=None,
            gripper_open_degree=None,
            mock=False,
            calibration_dir='.cache/calibration/so100'
        ), 
        control=RecordControlConfig(
            repo_id='tgossin/eval_so100_dataset_multitask',
            single_task='Grasp a lego block and put it in the bin.',
            multi_task=True,
            root=None,
            policy=ACTConfig(
                n_obs_steps=1,
                normalization_mapping={
                    'VISUAL': NormalizationMode.MEAN_STD,
                    'STATE': NormalizationMode.MEAN_STD,
                    'ACTION': NormalizationMode.MEAN_STD
                },
                input_features={
                    'observation.state': PolicyFeature(type=FeatureType.STATE, shape=(6,)),
                    'observation.images.mounted': PolicyFeature(type=FeatureType.VISUAL, shape=(3, 480, 640))
                },
                output_features={
                    'action': PolicyFeature(type=FeatureType.ACTION, shape=(6,))
                },
                device='cuda',
                use_amp=False,
                chunk_size=100,
                n_action_steps=100,
                use_onehot=True,
                onehot_action_dim=3,
                vision_backbone='resnet18',
                pretrained_backbone_weights='ResNet18_Weights.IMAGENET1K_V1',
                replace_final_stride_with_dilation=0,
                pre_norm=False,
                dim_model=512,
                n_heads=8,
                dim_feedforward=3200,
                feedforward_activation='relu',
                n_encoder_layers=4,
                n_decoder_layers=1,
                use_vae=True,
                latent_dim=32,
                n_vae_encoder_layers=4,
                temporal_ensemble_coeff=None,
                dropout=0.1,
                kl_weight=10.0,
                optimizer_lr=1e-05,
                optimizer_weight_decay=0.0001,
                optimizer_lr_backbone=1e-05,
                #pretrained_path='/Users/thomas/Documents/lbc/robot/lerobot-act/model'
            ),
            fps=30,
            warmup_time_s=5,
            episode_time_s=12,
            reset_time_s=8,
            num_episodes=1,
            video=True,
            push_to_hub=False,
            private=False,
            tags=[''],
            num_image_writer_processes=0,
            num_image_writer_threads_per_camera=4,
            display_data=False,
            play_sounds=True,
            resume=False
        )
    )
    cfg.control.policy.pretrained_path = '/Users/thomas/Documents/lbc/robot/lerobot-act/model'

    robot = make_robot_from_config(cfg.robot)
    record(robot, cfg.control, onehot_task=onehot_task, index=index)



if __name__ == "__main__":
    index = 0
    control_robot(onehot_task=[0,1,0], index=index)