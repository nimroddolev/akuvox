"""Constants for akuvox."""
from logging import Logger, getLogger

LOGGER: Logger = getLogger(__package__)

NAME = "Akuvox SmartPlus"
DOMAIN = "akuvox"
VERSION = "0.0.0"
ATTRIBUTION = "Data provided by https://https://www.akuvox.com/"

DEFAULT_COUNTRY_CODE = "+1"
DEFAULT_PHONE_NUMBER = "555-5555"

AKUVOV_SMS_LOGIN_API_VERSION = "6.6"
AKUVOV_REST_SERVER_API_VERSION = "6.0"
AKUVOV_OPENDOOR_API_VERSION = "4.3"
AKUVOX_USERCONF_API_VERSION = "6.5"
AKUVOX_REST_SERVER_ADDR = "gate.ecloud.akuvox.com"
AKUVOX_REST_SERVER_PORT = 8600

AKUVOX_API_REST_SERVER_DATA = "rest_server"
AKUVOX_API_SEND_SMS = "send_mobile_checkcode"
AKUVOX_API_SMS_LOGIN = "sms_login"
AKUVOX_API_USERCONF = "userconf"
AKUVOX_API_OPENDOOR = "opendoor"
