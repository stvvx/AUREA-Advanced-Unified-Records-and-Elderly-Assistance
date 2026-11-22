"""Support deployments on either side of the Birthday Benefits table rename."""


def renamed_birthday_benefit_path(path, response):
    table, separator, query = path.partition("?")
    if table != "octogenarian_benefit_applications" or response.status_code != 404:
        return None
    try:
        error = response.json()
    except ValueError:
        return None
    if (isinstance(error, dict) and error.get("code") in {"42P01", "PGRST205"}
            and table in str(error.get("message", ""))):
        return "birthday_benefit_applications" + separator + query
    return None
