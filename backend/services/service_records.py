"""Build an administrator's service history from existing service tables."""


def fetch_all(rest, table, select="*"):
    rows = []
    while True:
        page = rest("GET", table, params={"select": select, "order": "id.asc",
                    "limit": "100", "offset": str(len(rows))}) or []
        rows.extend(page)
        if len(page) < 100:
            return rows


def service_records(rest, users_table="users"):
    users = {str(row["id"]): row for row in fetch_all(rest, users_table,
             "id,first_name,middle_name,last_name,contact,address,role")}
    benefits = fetch_all(rest, "octogenarian_benefit_applications")
    reservations = fetch_all(rest, "movie_reservations")
    screenings = {str(row["id"]): row for row in fetch_all(rest, "movie_screenings")}
    movies = {str(row["id"]): row for row in fetch_all(rest, "movies")}
    result = []
    for service, rows in [("Birthday Benefits", benefits), ("Movie Center", reservations)]:
        for row in rows:
            user = users.get(str(row.get("user_id")), {})
            if str(user.get("role", "user")).strip().lower() in {
                "admin", "osca admin", "super admin", "med admin", "osca staff", "health center"
            }:
                continue
            screening = screenings.get(str(row.get("screening_id")), {})
            movie = movies.get(str(screening.get("movie_id")), {})
            is_benefit = service == "Birthday Benefits"
            result.append({
                "id": f"{service}:{row['id']}", "reference": str(row["id"]),
                "userId": row.get("user_id"),
                "lastName": user.get("last_name") or "", "firstName": user.get("first_name") or "",
                "middleName": user.get("middle_name") or "", "service": service,
                "details": (row.get("benefit_type") or "Birthday benefit") if is_benefit else (movie.get("title") or "Movie reservation"),
                "date": row.get("created_at") or row.get("date_of_application"),
                "status": (row.get("benefit_status") or "Pending") if is_benefit else (row.get("status") or "Pending"),
                "validation": row.get("validation_status") if is_benefit else None,
                "serviceDate": row.get("date_released") if is_benefit else screening.get("screening_date"),
                "amount": row.get("benefit_amount") if is_benefit else None,
                "contact": user.get("contact") or row.get("contact_number") or "",
                "address": user.get("address") or row.get("residential_address") or "",
            })
    return sorted(result, key=lambda row: str(row.get("date") or ""), reverse=True)
