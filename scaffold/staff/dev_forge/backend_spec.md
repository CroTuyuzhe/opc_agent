# Backend Development Spec

## Defaults
- RESTful API design
- JSON request/response format
- Proper HTTP status codes

## Code Quality
- Input validation at API boundaries
- Error responses with consistent format: `{ error: string, code: string }`
- No hardcoded secrets or credentials
- Environment-based configuration

## Database
- Migrations for schema changes
- Parameterized queries (no string concatenation for SQL)
