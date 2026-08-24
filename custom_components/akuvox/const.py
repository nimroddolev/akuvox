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

SUBDOMAIN_AU = "aucloud"
SUBDOMAIN_C = "ccloud"
SUBDOMAIN_J = "jcloud"
SUBDOMAIN_RU = "rucloud"
SUBDOMAIN_S = "scloud"
SUBDOMAIN_U = "ucloud"
SUBDOMAIN_E = "ecloud"

SUBDOMAINS_LIST: list = [
    "Default",
    SUBDOMAIN_AU,
    SUBDOMAIN_C,
    SUBDOMAIN_J,
    SUBDOMAIN_RU,
    SUBDOMAIN_S,
    SUBDOMAIN_U,
    SUBDOMAIN_E,
]

LOCATIONS_DICT = {
    "AR": {
        "country": "Argentina",
        "phone_number": "54",
        "flag": "🇦🇷",
        "subdomain": "ucloud"
    },
    "AU": {
        "country": "Australia",
        "phone_number": "61",
        "flag": "🇦🇺",
        "subdomain": "scloud"
    },
    "AZ": {
        "country": "Azerbaijan",
        "phone_number": "994",
        "flag": "🇦🇿",
        "subdomain": "ecloud"
    },
    "BH": {
        "country": "Bahrain",
        "phone_number": "973",
        "flag": "🇧🇭",
        "subdomain": "ecloud"
    },
    "BY": {
        "country": "Belarus",
        "phone_number": "375",
        "flag": "🇧🇾",
        "subdomain": "rucloud"
    },

    "BE": {
        "country": "Belgium",
        "phone_number": "32",
        "flag": "🇧🇪",
        "subdomain": "ecloud"
    },
    "BN": {
        "country": "Brunei",
        "phone_number": "673",
        "flag": "🇧🇳",
        "subdomain": "scloud"
    },
    "BR": {
        "country": "Brazil",
        "phone_number": "55",
        "flag": "🇧🇷",
        "subdomain": "ucloud"
    },
    "CA": {
        "country": "Canada",
        "phone_number": "1",
        "flag": "🇨🇦",
        "subdomain": "ucloud"
    },
    "CH": {
        "country": "Chile",
        "phone_number": "56",
        "flag": "🇨🇱",
        "subdomain": "ucloud"
    },
    "CN": {
        "country": "China",
        "phone_number": "86",
        "flag": "🇨🇳",
        "subdomain": "ccloud"
    },
    "CO": {
        "country": "Colombia",
        "phone_number": "57",
        "flag": "🇨🇴",
        "subdomain": "ucloud"
    },
    "CZ": {
        "country": "Czech Republic",
        "phone_number": "420",
        "flag": "🇨🇿",
        "subdomain": "ecloud"
    },
    "DE": {
        "country": "Germany",
        "phone_number": "49",
        "flag": "🇩🇪",
        "subdomain": "ecloud"
    },
    "EE": {
        "country": "Estonia",
        "phone_number": "372",
        "flag": "🇪🇪",
        "subdomain": "ecloud"
    },
    "EC": {
        "country": "Ecuador",
        "phone_number": "593",
        "flag": "🇪🇨",
        "subdomain": "ucloud"
    },
    "FJ": {
        "country": "Fiji",
        "phone_number": "679",
        "flag": "🇫🇯",
        "subdomain": "scloud"
    },
    "GB": {
        "country": "United Kingdom",
        "phone_number": "44",
        "flag": "🇬🇧",
        "subdomain": "ecloud"
    },
    "GE": {
        "country": "Georgia",
        "phone_number": "995",
        "flag": "🇬🇪",
        "subdomain": "ecloud"
    },
    "HK": {
        "country": "Hong Kong",
        "phone_number": "852",
        "flag": "🇭🇰",
        "subdomain": "scloud"
    },
    "ID": {
        "country": "Indonesia",
        "phone_number": "62",
        "flag": "🇮🇩",
        "subdomain": "scloud"
    },
    "IL": {
        "country": "Israel",
        "phone_number": "972",
        "flag": "🇮🇱",
        "subdomain": "ecloud"
    },
    "IR": {
        "country": "Iran",
        "phone_number": "98",
        "flag": "🇮🇷",
        "subdomain": "ecloud"
    },
    "IT": {
        "country": "Italy",
        "phone_number": "39",
        "flag": "🇮🇹",
        "subdomain": "ecloud"
    },
    "JO": {
        "country": "Jordan",
        "phone_number": "962",
        "flag": "🇯🇴",
        "subdomain": "ecloud"
    },
    "JP": {
        "country": "Japan",
        "phone_number": "81",
        "flag": "🇯🇵",
        "subdomain": "jcloud"
    },
    "KR": {
        "country": "South Korea",
        "phone_number": "82",
        "flag": "🇰🇷",
        "subdomain": "jcloud"
    },
    "KW": {
        "country": "Kuwait",
        "phone_number": "965",
        "flag": "🇰🇼",
        "subdomain": "ecloud"
    },
    "KZ": {
        "country": "Kazakhstan",
        "phone_number": "7",
        "flag": "🇰🇿",
        "subdomain": "scloud"
    },
    "LB": {
        "country": "Lebanon",
        "phone_number": "961",
        "flag": "🇱🇧",
        "subdomain": "ecloud"
    },
    "LV": {
        "country": "Latvia",
        "phone_number": "371",
        "flag": "🇱🇻",
        "subdomain": "ecloud"
    },
    "MO": {
        "country": "Macao",
        "phone_number": "853",
        "flag": "🇲🇴",
        "subdomain": "scloud"
    },
    "MN": {
        "country": "Mongolia",
        "phone_number": "976",
        "flag": "🇲🇳",
        "subdomain": "jcloud"
    },
    "MV": {
        "country": "Maldives",
        "phone_number": "960",
        "flag": "🇲🇻",
        "subdomain": "scloud"
    },
    "MX": {
        "country": "Mexico",
        "phone_number": "52",
        "flag": "🇲🇽",
        "subdomain": "ucloud"
    },
    "MY": {
        "country": "Malaysia",
        "phone_number": "60",
        "flag": "🇲🇾",
        "subdomain": "scloud"
    },
    "NL": {
        "country": "Netherlands",
        "phone_number": "31",
        "flag": "🇳🇱",
        "subdomain": "ecloud"
    },
    "NO": {
        "country": "Norway",
        "phone_number": "47",
        "flag": "🇳🇴",
        "subdomain": "ecloud"
    },
    "NZ": {
        "country": "New Zealand",
        "phone_number": "64",
        "flag": "🇳🇿",
        "subdomain": "scloud"
    },
    "OM": {
        "country": "Oman",
        "phone_number": "968",
        "flag": "🇴🇲",
        "subdomain": "ecloud"
    },
    "PE": {
        "country": "Peru",
        "phone_number": "51",
        "flag": "🇵🇪",
        "subdomain": "ucloud"
    },
    "PH": {
        "country": "Philippines",
        "phone_number": "63",
        "flag": "🇵🇭",
        "subdomain": "scloud"
    },
    "PK": {
        "country": "Pakistan",
        "phone_number": "92",
        "flag": "🇵🇰",
        "subdomain": "scloud"
    },
    "PL": {
        "country": "Poland",
        "phone_number": "48",
        "flag": "🇵🇱",
        "subdomain": "ecloud"
    },
    "PT": {
        "country": "Portugal",
        "phone_number": "351",
        "flag": "🇵🇹",
        "subdomain": "ecloud"
    },
    "PY": {
        "country": "Paraguay",
        "phone_number": "595",
        "flag": "🇵🇾",
        "subdomain": "ucloud"
    },
    "RO": {
        "country": "Romania",
        "phone_number": "40",
        "flag": "🇷🇴",
        "subdomain": "ecloud"
    },
    "RU": {
        "country": "Russia",
        "phone_number": "7",
        "flag": "🇷🇺",
        "subdomain": "rucloud"
    },
    "SA": {
        "country": "Saudi Arabia",
        "phone_number": "966",
        "flag": "🇸🇦",
        "subdomain": "ecloud"
    },
    "SG": {
        "country": "Singapore",
        "phone_number": "65",
        "flag": "🇸🇬",
        "subdomain": "scloud"
    },
    "SE": {
        "country": "Sweden",
        "phone_number": "46",
        "flag": "🇸🇪",
        "subdomain": "ecloud"
    },
    "TH": {
        "country": "Thailand",
        "phone_number": "66",
        "flag": "🇹🇭",
        "subdomain": "scloud"
    },
    "TN": {
        "country": "Tunisia",
        "phone_number": "216",
        "flag": "🇹🇳",
        "subdomain": "ecloud"
    },
    "TR": {
        "country": "Turkey",
        "phone_number": "90",
        "flag": "🇹🇷",
        "subdomain": "ecloud"
    },
    "TW": {
        "country": "Taiwan",
        "phone_number": "886",
        "flag": "🇹🇼",
        "subdomain": "scloud"
    },
    "UA": {
        "country": "Ukraine",
        "phone_number": "380",
        "flag": "🇺🇦",
        "subdomain": "ecloud"
    },
    "AE": {
        "country": "United Arab Emirates",
        "phone_number": "971",
        "flag": "🇦🇪",
        "subdomain": "ecloud"
    },
    "US": {
        "country": "United States",
        "phone_number": "1",
        "flag": "🇺🇸",
        "subdomain": "ucloud"
    },
    "VN": {
        "country": "Vietnam",
        "phone_number": "84",
        "flag": "🇻🇳",
        "subdomain": "scloud"
    }
}

COUNTRY_PHONE: dict = {
    "AZ": "994",
    "BH": "973",
    "BY": "375",
    "BE": "32",
    "CZ": "420",
    "EE": "372",
    "GE": "995",
    "DE": "49",
    "IR": "98",
    "IL": "972",
    "IT": "39",
    "JO": "962",
    "KW": "965",
    "LV": "371",
    "LB": "961",
    "NL": "31",
    "NO": "47",
    "OM": "968",
    "PL": "48",
    "PT": "351",
    "RO": "40",
    "SA": "966",
    "TN": "216",
    "TR": "90",
    "TW": "886",
    "UA": "380",
    "US": "1",
    "VN": "84",
    "AR": "54",
    "BR": "55",
    "CA": "1",
    "CL": "56",
    "CO": "57",
    "EC": "593",
    "MX": "52",
    "PY": "595",
    "PE": "51",
    "JP": "81",
    "MN": "976",
    "KR": "82",
    "AU": "61",
    "BN": "673",
    "FJ": "679",
    "HK": "852",
    "ID": "62",
    "KZ": "7",
    "MO": "853",
    "MY": "60",
    "MV": "960",
    "NZ": "64",
    "PK": "92",
    "PH": "63",
    "SG": "65",
    "SE": "46",
    "TH": "66",
    "CN": "86",
    "AE": "971",
    "RU": "7"
}



SMS_LOGIN_API_VERSION = "6.6"
REST_SERVER_API_VERSION = "6.0"
OPENDOOR_API_VERSION = "4.3"
USERCONF_API_VERSION = "6.5"
REST_SERVER_ADDR = "gate.subdomain.akuvox.com"
REST_SERVER_PORT = 8600

API_REST_SERVER_DATA = "rest_server"
API_SEND_SMS = "send_mobile_checkcode"
API_SERVERS_LIST = "servers_list"
API_SMS_LOGIN = "sms_login"
API_USERCONF = "userconf"
API_OPENDOOR = "opendoor"

API_APP_HOST = "subdomain.akuvox.com/web-server/v3/app/"
API_GET_PERSONAL_TEMP_KEY_LIST = "tempKey/getPersonalTempKeyList?row=20&page=1"
API_GET_PERSONAL_DOOR_LOG = "log/getDoorLog?row=1"
API_GET_PERSONAL_CALL_LOG = "log/getCallLog?row=1"

TEMP_KEY_QR_HOST = "subdomain.akuvox.com"

DATA_STORAGE_KEY = "akuvox_data_storage_key"

ID_KEY = "ID"
CAPTURE_TIME_KEY = "CaptureTime"
PIC_URL_KEY = "PicUrl"
