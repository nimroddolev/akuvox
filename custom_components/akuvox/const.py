"""Constants for akuvox."""
from logging import Logger, getLogger

LOGGER: Logger = getLogger(__package__)

NAME = "Akuvox SmartPlus"
DOMAIN = "akuvox"
VERSION = "0.0.1"
ATTRIBUTION = "Data provided by https://ecloud.akuvox.com/"

DEFAULT_COUNTRY_CODE = "+1"
DEFAULT_PHONE_NUMBER = "555-5555"
DEFAULT_APP_TOKEN = ""
DEFAULT_TOKEN = ""

SMS_LOGIN_API_VERSION = "6.6"
REST_SERVER_API_VERSION = "6.0"
OPENDOOR_API_VERSION = "4.3"
USERCONF_API_VERSION = "6.5"
REST_SERVER_ADDR = "gate.ecloud.akuvox.com"
REST_SERVER_PORT = 8600

API_REST_SERVER_DATA = "rest_server"
API_SEND_SMS = "send_mobile_checkcode"
API_SERVERS_LIST = "servers_list"
API_SMS_LOGIN = "sms_login"
API_USERCONF = "userconf"
API_OPENDOOR = "opendoor"

API_TEMP_KEY_LIST_HOST = "ecloud.akuvox.com/web-server/v3/app/community"
API_GET_PERSONAL_TEMP_KEY_LIST = "tempKey/getPersonalTempKeyList?row=20&page=1"
API_GET_PERSONAL_DOOR_LOG = "log/getDoorLog?row=1"

TEMP_KEY_QR_HOST = "ecloud.akuvox.com"

DATA_STORAGE_KEY = "akuvox_data_storage_key"
