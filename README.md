# Bitespeed Assignment

This project is a solution for the Bitespeed backend assignment.

## API Endpoint

The primary API endpoint for this service is:

`POST` `https://bitespeed-assignment-epj4.onrender.com/identify`

### Request Body

The `/identify` endpoint expects a JSON body with either an `email` or a `phoneNumber` (or both):

```json
{
  "email": "lorraine@hillvalley.edu",
  "phoneNumber": "123456"
}
```

### Response Body

The endpoint will respond with a consolidated contact profile:

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```