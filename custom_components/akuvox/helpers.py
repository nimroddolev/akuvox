"""Helper functions."""

from .const import (
    # LOGGER,
    COUNTRY_PHONE,
    LOCATIONS_DICT
)

class AkuvoxHelpers:
    """Class with helper functions."""

    def get_subdomain_from_country_code(self, country_code):
        """User's subdomain."""
        location_dict = self.get_location_dict(country_code)
        if location_dict:
            return location_dict["subdomain"]
        return "ecloud"

    def get_location_dict(self, country_code):
        """User's location dict."""
        if country_code and len(country_code) > 0 and country_code != "-1":
            country_name = self.find_country_name_code(country_code)
            location_dict = LOCATIONS_DICT.get(str(country_name))
            return location_dict
        return {
            "country": "Unknown",
            "phone_number": "Unknown",
            "flag": "?",
            "subdomain": "ecloud"
        }

    def find_country_name_code(self, country_phone_number):
        """2-letter country name code for a given country code phone number."""
        for code, number in COUNTRY_PHONE.items():
            if number == country_phone_number:
                return code
        return None

    def get_country_codes_list(self):
        """List of international country phone codes supported by Akuvox."""
        country_codes = []
        for _country, code in COUNTRY_PHONE.items():
            country_codes.append(str(code))
        return country_codes

    def get_country_names_list(self):
        """List of country names supported by Akuvox."""
        country_names_list:list = []
        for _country, country_dict in LOCATIONS_DICT.items():
            country_names_list.append(country_dict.get("country"))
        return country_names_list

    def get_country_phone_code_from_name(self, country_name):
        """Country code corresponding to the country name."""
        for _key, value in LOCATIONS_DICT.items():
            if value.get("country") == country_name:
                return value.get("phone_number")
        return None
