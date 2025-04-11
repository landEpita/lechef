import logging.config

# from fastapi_login import LoginManager

# from src.core.exceptions import NotAuthenticatedException

# logging
logging.config.fileConfig('src/logging.conf', disable_existing_loggers=False)

# manager
# manager = LoginManager(
#     "secret-key",
#     "/login",
#     use_cookie=True,
#     custom_exception=NotAuthenticatedException
# )
# manager.cookie_name = "some-name"
