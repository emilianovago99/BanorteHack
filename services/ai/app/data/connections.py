"""Factories opcionales. El flujo demo no abre conexiones externas."""
from app.config import Settings


def postgres_connection():
    import psycopg
    return psycopg.connect(Settings().database_url)


def mongo_client():
    from pymongo import MongoClient
    return MongoClient(Settings().mongodb_uri, serverSelectionTimeoutMS=5000)
