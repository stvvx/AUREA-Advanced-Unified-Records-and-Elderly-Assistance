
import secrets
import re
from datetime import date, datetime, timedelta, timezone

import requests
from flask import Blueprint, jsonify, request

from config import Config
from services.memory_service import _supabase

from concurrent.futures import ThreadPoolExecutor


movie_center_bp = Blueprint(
    "movie_center",
    __name__,
    url_prefix="/api/movie-center",
)

FULL_ADMIN_ROLES = {"osca admin", "super admin"}
STAFF_ROLES = FULL_ADMIN_ROLES | {"osca staff"}
READ_ALL_ROLES = STAFF_ROLES | {"med admin", "health center"}
VALID_RESERVATION_STATUSES = {"Pending", "Confirmed", "Cancelled"}

MOVIE_FIELDS = {
    "title",
    "description",
    "poster_url",
    "age_rating",
    "is_active",
}

SCREENING_FIELDS = {
    "movie_id",
    "screening_date",
    "screening_time",
    "capacity",
    "is_active",
}


def error_response(message, status=400):
    return jsonify({"success": False, "error": message}), status


def get_requester(user_id):
    """Fetch the actual role from Supabase; never trust a role from the client."""
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return None, error_response("A valid user_id is required.", 400)

    try:
        users = _supabase(
            "GET",
            "users",
            params={
                "select": "id,role,first_name,last_name,dob",
                "id": f"eq.{user_id}",
                "limit": "1",
            },
        )
    except Exception as exc:
        return None, error_response(str(exc), 500)

    if not isinstance(users, list) or not users:
        return None, error_response("User was not found.", 404)

    return users[0], None


def require_role(user_id, allowed_roles):
    user, error = get_requester(user_id)
    if error:
        return None, error

    role = str(user.get("role") or "user").strip().lower()

    if role not in allowed_roles:
        return None, error_response(
            "You do not have permission to perform this action.",
            403,
        )

    return user, None


def get_user_id(data=None):
    data = data or {}
    return data.get("user_id") or request.args.get("user_id")


def fetch_one(table, record_id, select="*"):
    rows = _supabase(
        "GET",
        table,
        params={
            "select": select,
            "id": f"eq.{record_id}",
            "limit": "1",
        },
    )
    return rows[0] if isinstance(rows, list) and rows else None


def update_record(table, record_id, payload):
    _supabase(
        "PATCH",
        f"{table}?id=eq.{record_id}",
        payload=payload,
    )
    return fetch_one(table, record_id)


def get_available_slots(screening):
    reservations = _supabase(
        "GET",
        "movie_reservations",
        params={
            "select": "attendee_count",
            "screening_id": f"eq.{screening['id']}",
            "status": "in.(Pending,Confirmed)",
        },
    )

    reserved = sum(
        int(item.get("attendee_count") or 0)
        for item in (reservations or [])
    )

    capacity = int(screening.get("capacity") or 0)
    return max(capacity - reserved, 0)


# ==========================================================
# MOVIES
# ==========================================================

@movie_center_bp.route("/movies", methods=["GET"])
def list_movies():
    user_id = get_user_id()
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            requester_future = executor.submit(
                require_role,
                user_id,
                {"user"} | READ_ALL_ROLES,
            )
            movies_future = executor.submit(
                _supabase,
                "GET",
                "movies",
                params={
                    "select": "*",
                    "is_active": "eq.true",
                    "order": "created_at.desc",
                },
            )

            _, error = requester_future.result()
            if error:
                return error

            movies = movies_future.result()

        return jsonify({
            "success": True,
            "movies": movies or [],
        }), 200
    except Exception as exc:
        return error_response(str(exc), 500)


@movie_center_bp.route("/movies", methods=["POST"])
def create_movie():
    data = request.get_json(silent=True) or {}

    _, error = require_role(
        get_user_id(data),
        FULL_ADMIN_ROLES,
    )
    if error:
        return error

    title = str(data.get("title") or "").strip()
    if not title:
        return error_response("Movie title is required.")

    payload = {
        key: data[key]
        for key in MOVIE_FIELDS
        if key in data
    }
    payload["title"] = title

    try:
        created = _supabase("POST", "movies", payload=payload)
        movie = created[0] if isinstance(created, list) and created else created

        return jsonify({
            "success": True,
            "movie": movie,
        }), 201
    except Exception as exc:
        return error_response(str(exc), 500)


@movie_center_bp.route("/movies/<movie_id>", methods=["PATCH"])
def update_movie(movie_id):
    data = request.get_json(silent=True) or {}

    _, error = require_role(
        get_user_id(data),
        FULL_ADMIN_ROLES,
    )
    if error:
        return error

    payload = {
        key: data[key]
        for key in MOVIE_FIELDS
        if key in data
    }

    if "title" in payload:
        payload["title"] = str(payload["title"] or "").strip()
        if not payload["title"]:
            return error_response("Movie title cannot be empty.")

    if not payload:
        return error_response("No movie fields were provided.")

    try:
        movie = update_record("movies", movie_id, payload)
        if not movie:
            return error_response("Movie was not found.", 404)

        return jsonify({
            "success": True,
            "movie": movie,
        }), 200
    except Exception as exc:
        return error_response(str(exc), 500)


# ==========================================================
# SCREENINGS
# ==========================================================

@movie_center_bp.route("/screenings", methods=["GET"])
def list_screenings():
    _, error = require_role(
        get_user_id(),
        {"user"} | READ_ALL_ROLES,
    )
    if error:
        return error

    params = {
        "select": "*",
        "is_active": "eq.true",
        "order": "screening_date.asc,screening_time.asc",
    }

    movie_id = request.args.get("movie_id")
    screening_date = request.args.get("date")

    if movie_id:
        params["movie_id"] = f"eq.{movie_id}"

    if screening_date:
        params["screening_date"] = f"eq.{screening_date}"

    try:
        screenings = _supabase(
            "GET",
            "movie_screenings",
            params=params,
        )

        result = []
        for screening in screenings or []:
            result.append({
                **screening,
                "available_slots": get_available_slots(screening),
            })

        return jsonify({
            "success": True,
            "screenings": result,
        }), 200
    except Exception as exc:
        return error_response(str(exc), 500)


@movie_center_bp.route("/screenings", methods=["POST"])
def create_screening():
    data = request.get_json(silent=True) or {}

    _, error = require_role(
        get_user_id(data),
        STAFF_ROLES,
    )
    if error:
        return error

    required = ("movie_id", "screening_date", "screening_time")
    if any(not str(data.get(field) or "").strip() for field in required):
        return error_response(
            "Movie, screening date, and screening time are required."
        )

    try:
        capacity = int(data.get("capacity", 20))
        if capacity < 1:
            return error_response("Capacity must be at least 1.")

        movie = fetch_one("movies", data["movie_id"])
        if not movie or not movie.get("is_active"):
            return error_response("Active movie was not found.", 404)

        payload = {
            "movie_id": data["movie_id"],
            "screening_date": data["screening_date"],
            "screening_time": data["screening_time"],
            "capacity": capacity,
            "is_active": True,
        }

        created = _supabase(
            "POST",
            "movie_screenings",
            payload=payload,
        )
        screening = (
            created[0]
            if isinstance(created, list) and created
            else created
        )

        return jsonify({
            "success": True,
            "screening": screening,
        }), 201
    except Exception as exc:
        return error_response(str(exc), 500)


@movie_center_bp.route("/screenings/<screening_id>", methods=["PATCH"])
def update_screening(screening_id):
    data = request.get_json(silent=True) or {}

    _, error = require_role(
        get_user_id(data),
        STAFF_ROLES,
    )
    if error:
        return error

    payload = {
        key: data[key]
        for key in SCREENING_FIELDS
        if key in data
    }

    if "capacity" in payload:
        try:
            payload["capacity"] = int(payload["capacity"])
        except (TypeError, ValueError):
            return error_response("Capacity must be a valid number.")

        if payload["capacity"] < 1:
            return error_response("Capacity must be at least 1.")

    if not payload:
        return error_response("No screening fields were provided.")

    try:
        current = fetch_one("movie_screenings", screening_id)
        if not current:
            return error_response("Screening was not found.", 404)

        if "capacity" in payload:
            reserved = int(current["capacity"]) - get_available_slots(current)
            if payload["capacity"] < reserved:
                return error_response(
                    f"Capacity cannot be lower than the {reserved} "
                    "already reserved slots."
                )

        screening = update_record(
            "movie_screenings",
            screening_id,
            payload,
        )

        return jsonify({
            "success": True,
            "screening": screening,
        }), 200
    except Exception as exc:
        return error_response(str(exc), 500)


# ==========================================================
# RESERVATIONS
# ==========================================================

@movie_center_bp.route("/screenings/<screening_id>/seats", methods=["GET"])
def screening_reserved_seats(screening_id):
    user, error = get_requester(get_user_id())
    if error:
        return error
    try:
        rows = _supabase("GET", "movie_reservation_seats", params={
            "screening_id": f"eq.{screening_id}", "select": "seat_label",
        }) or []
        return jsonify({"reserved_seats": [row["seat_label"] for row in rows]}), 200
    except Exception:
        return error_response("Could not load reserved seats. Please try again.", 503)


@movie_center_bp.route("/reservations", methods=["POST"])
def create_reservation():
    data = request.get_json(silent=True) or {}

    user, error = require_role(
        get_user_id(data),
        {"user"},
    )
    if error:
        return error

    screening_id = data.get("screening_id")

    try:
        today = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
        existing = _supabase("GET", "movie_reservations", params={
            "user_id": f"eq.{user['id']}",
            "status": "in.(Pending,Confirmed)",
            "select": "id,screening_id",
        }) or []
        for reservation in existing:
            previous_screening = fetch_one("movie_screenings", reservation.get("screening_id"))
            previous_date = (previous_screening or {}).get("screening_date")
            if not previous_date or str(previous_date)[:10] >= today:
                return error_response(
                    "You already have an active reservation. Cancel it before booking another screening.", 409
                )
        seats = data.get("seat_labels")
        if not isinstance(seats, list) or not 1 <= len(seats) <= 5 or any(
            not isinstance(seat, str) or not re.fullmatch(r"[A-G](10|[1-9])", seat) for seat in seats
        ) or len(set(seats)) != len(seats):
            return error_response("Select between one and five available seats.")
        attendee_count = len(seats)
        if attendee_count < 1:
            return error_response("At least one attendee is required.")

        screening = fetch_one("movie_screenings", screening_id)
        if not screening or not screening.get("is_active"):
            return error_response("This screening is unavailable.", 404)

        if screening.get("screening_date") < today:
            return error_response("This screening date has already passed.")

        confirmation_code = (
            "AUR-" + secrets.token_hex(4).upper()
        )

        rpc_url = (
            f"{Config.SUPABASE_URL}/rest/v1/rpc/"
            "reserve_movie_screening_with_seats"
        )

        response = requests.post(
            rpc_url,
            headers={
                "apikey": Config.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": (
                    f"Bearer {Config.SUPABASE_SERVICE_ROLE_KEY}"
                ),
                "Content-Type": "application/json",
            },
            json={
                "p_screening_id": screening_id,
                "p_user_id": int(user["id"]),
                "p_seat_labels": seats,
                "p_confirmation_code": confirmation_code,
            },
            timeout=30,
        )

        if not response.ok:
            try:
                message = response.json().get("message") or response.text
            except ValueError:
                message = response.text

            return error_response(message, 409)

        result = response.json()

        return jsonify({
            "success": True,
            "reservation": result,
        }), 201

    except (TypeError, ValueError):
        return error_response("Invalid attendee count or screening ID.")
    except Exception as exc:
        return error_response(str(exc), 500)


@movie_center_bp.route("/reservations", methods=["GET"])
def list_reservations():
    user, error = get_requester(get_user_id())
    if error:
        return error

    role = str(user.get("role") or "user").strip().lower()
    is_admin = role in READ_ALL_ROLES

    params = {
        "select": "*",
        "order": "created_at.desc",
    }

    if not is_admin:
        params["user_id"] = f"eq.{user['id']}"

    try:
        # 1. Fetch reservations only
        reservations = _supabase(
            "GET",
            "movie_reservations",
            params=params,
        ) or []

        if not reservations:
            return jsonify({
                "success": True,
                "reservations": [],
            }), 200

        # 2. Get only the IDs needed
        screening_ids = list({
            str(item["screening_id"])
            for item in reservations
            if item.get("screening_id")
        })

        user_ids = list({
            str(item["user_id"])
            for item in reservations
            if item.get("user_id")
        })

        if not screening_ids:
            return jsonify({
                "success": True,
                "reservations": [],
            }), 200

        # 3. Fetch only related screenings
        screenings = _supabase(
            "GET",
            "movie_screenings",
            params={
                "select": "*",
                "id": f"in.({','.join(screening_ids)})",
            },
        ) or []

        screening_map = {
            str(item["id"]): item
            for item in screenings
        }

        movie_ids = list({
            str(item["movie_id"])
            for item in screenings
            if item.get("movie_id")
        })

        # 4. Fetch related movies and applicants in parallel
        with ThreadPoolExecutor(max_workers=2) as executor:
            movie_future = executor.submit(
                _supabase,
                "GET",
                "movies",
                params={
                    "select": "id,title,poster_url",
                    "id": f"in.({','.join(movie_ids)})",
                } if movie_ids else None,
            )

            user_future = executor.submit(
                _supabase,
                "GET",
                "users",
                params={
                    "select": "id,first_name,last_name,role",
                    "id": f"in.({','.join(user_ids)})",
                } if is_admin and user_ids else {
                    "select": "id,first_name,last_name",
                    "id": f"eq.{user['id']}",
                },
            )

            movies = movie_future.result() or []
            users = user_future.result() or []

        movie_map = {
            str(item["id"]): item
            for item in movies
        }

        user_map = {
            str(item["id"]): item
            for item in users
        }

        # 5. Build response for frontend
        result = []

        for reservation in reservations:
            screening = screening_map.get(
                str(reservation.get("screening_id")),
                {},
            )

            movie = movie_map.get(
                str(screening.get("movie_id")),
                {},
            )

            applicant = user_map.get(
                str(reservation.get("user_id")),
                {},
            )

            applicant_name = " ".join(
                part for part in [
                    applicant.get("first_name"),
                    applicant.get("last_name"),
                ]
                if part
            )

            result.append({
                **reservation,

                # Flattened fields used by the frontend
                "movie_title": movie.get("title"),
                "poster_url": movie.get("poster_url"),
                "screening_date": screening.get("screening_date"),
                "screening_time": screening.get("screening_time"),
                "applicant_name": applicant_name or None,

                # Keep nested data available too
                "movie": movie,
                "screening": screening,
                "applicant": applicant or None,
            })

        return jsonify({
            "success": True,
            "reservations": result,
        }), 200

    except Exception as exc:
        print(f"[Movie Center] Reservations error: {exc}")
        return error_response(str(exc), 500)


@movie_center_bp.route("/reservations/<reservation_id>", methods=["PATCH"])
def update_reservation(reservation_id):
    data = request.get_json(silent=True) or {}

    user, error = get_requester(get_user_id(data))
    if error:
        return error

    role = str(user.get("role") or "user").strip().lower()
    new_status = data.get("status")

    if new_status not in VALID_RESERVATION_STATUSES:
        return error_response("Invalid reservation status.")

    try:
        current = fetch_one("movie_reservations", reservation_id)
        if not current:
            return error_response("Reservation was not found.", 404)

        if role == "user":
            if str(current.get("user_id")) != str(user["id"]):
                return error_response("You cannot update this reservation.", 403)

            if new_status != "Cancelled":
                return error_response(
                    "You may only cancel your own reservation.",
                    403,
                )

        elif role in STAFF_ROLES:
            pass

        else:
            return error_response(
                "You do not have permission to update reservations.",
                403,
            )

        if current.get("status") == "Cancelled":
            return error_response("This reservation is already cancelled.")

        updated = update_record(
            "movie_reservations",
            reservation_id,
            {"status": new_status},
        )

        return jsonify({
            "success": True,
            "reservation": updated,
        }), 200

    except Exception as exc:
        return error_response(str(exc), 500)
