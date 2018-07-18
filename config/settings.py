import os
from config import origin_defaults
import dotenv

dotenv_filename = dotenv.find_dotenv()
if dotenv_filename:
    dotenv.load_dotenv(dotenv_filename)


def parse_bool(env_value):
    return env_value is not None and env_value.lower() not in ('0', 'false')


def get_env_default(key):
    v = os.environ.get(key)
    if v in (None, "") and hasattr(origin_defaults, key):
        return getattr(origin_defaults, key)
    else:
        return v


DEBUG = parse_bool(get_env_default('DEBUG'))

env_key = os.environ.get("ENVKEY")
if env_key:
    # if ENVKEY is set load up envkey
    # NOTE: this actually load_dotenv twice in the __init__ file.
    # Also seems to imply .env use is dev only. May need a PR to
    # resolve that issue
    from envkey import fetch
    import json

    # This is taken from https://github.com/envkey/envkey-python/
    # customized because it doesn't allow different default values
    # and .env live environments
    # TODO: add a seperate env variable to indicate dev/staging/live
    fetch_res = fetch.fetch_env(env_key, is_dev=DEBUG)

    if fetch_res.startswith("error: "):
        raise ValueError("ENVKEY invalid. Couldn't load vars.")

    parsed = json.loads(fetch_res)
    vars_set = dict()
    for k, v in parsed.items():
        if os.environ.get(k) in (None, ""):
            os.environ[k] = v


def abspath(relative_file_path):
    return os.path.join(PROJECTPATH, relative_file_path)


HOST = get_env_default('HOST')
HTTPS = parse_bool(get_env_default('HTTPS'))
PROJECTPATH = get_env_default('PROJECTPATH') or os.getcwd()
FLASK_SECRET_KEY = get_env_default('FLASK_SECRET_KEY')
PUBLIC_ID_ENCRYPTION_KEY = get_env_default('PUBLIC_ID_ENCRYPTION_KEY')

DATABASE_URL = get_env_default('DATABASE_URL')

TEMPLATE_ROOT = os.path.join(PROJECTPATH, 'templates')
STATIC_ROOT = os.path.join(PROJECTPATH, 'static')

FACEBOOK_CLIENT_ID = get_env_default('FACEBOOK_CLIENT_ID')
FACEBOOK_CLIENT_SECRET = get_env_default('FACEBOOK_CLIENT_SECRET')

SENDGRID_FROM_EMAIL = get_env_default('SENDGRID_FROM_EMAIL')

SENDGRID_API_KEY = get_env_default('SENDGRID_API_KEY')

TWILIO_ACCOUNT_SID = get_env_default('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = get_env_default('TWILIO_AUTH_TOKEN')
TWILIO_NUMBER = get_env_default('TWILIO_NUMBER')

RPC_SERVER = get_env_default('RPC_SERVER')
RPC_PROTOCOL = get_env_default('RPC_PROTOCOL')

IPFS_DOMAIN = get_env_default('IPFS_DOMAIN')
IPFS_PORT = get_env_default('IPFS_PORT')

TWITTER_CONSUMER_KEY = get_env_default('TWITTER_CONSUMER_KEY')
TWITTER_CONSUMER_SECRET = get_env_default('TWITTER_CONSUMER_SECRET')

ATTESTATION_SIGNING_KEY = get_env_default('ATTESTATION_SIGNING_KEY')

REDIS_URL = get_env_default('REDIS_URL')
CELERY_DEBUG = parse_bool(get_env_default('CELERY_DEBUG'))

ENABLE_EVENT_NOTIFICATIONS = parse_bool(get_env_default('ENABLE_EVENT_NOTIFICATIONS'))

APNS_CERT_FILE = get_env_default('APNS_CERT_FILE')
APNS_CERT_PASSWORD = get_env_default('APNS_CERT_PASSWORD')
APNS_APP_BUNDLE_ID = get_env_default('APNS_APP_BUNDLE_ID')

FCM_API_KEY = get_env_default('FCM_API_KEY')
FCM_TITLE = get_env_default('FCM_TITLE')

BIND_HOST = get_env_default("BIND_HOST")
