<h1 align="center">
  <br />
  Oday Tourism — Backend API
</h1>

<p align="center">
  A production-ready RESTful API for a full-service tourism platform, built with NestJS, Prisma, and MariaDB.
  <br />
  Supports hotel management, trip packages, offers, media uploads, security approvals, and more.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square&logo=nestjs" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/Prisma-7-2D3748?style=flat-square&logo=prisma" />
  <img src="https://img.shields.io/badge/MariaDB-MySQL-003545?style=flat-square&logo=mariadb" />
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22.13-339933?style=flat-square&logo=node.js" />
  <img src="https://img.shields.io/badge/Swagger-UI-85EA2D?style=flat-square&logo=swagger" />
</p>

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Modules & API Endpoints](#modules--api-endpoints)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
  - [Running the App](#running-the-app)
- [Seeding](#seeding)
- [API Documentation](#api-documentation)
- [Available Scripts](#available-scripts)

---

## Overview

Oday Tourism API is the backend engine for a comprehensive travel and tourism management system. It exposes a REST API consumed by admin dashboards and client-facing applications to manage:

- **Hotels** with multilingual content, rooms, add-ons, and media galleries
- **Trip packages** with options, add-ons, translations, and YouTube previews
- **Offers** and **Photo Galleries** backed by ImageKit CDN
- **Security Approval** services including airline and nationality-based pricing
- **Client Reviews (Comments)** and **FAQ Questions**
- **JWT-based Admin Authentication**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 |
| Language | TypeScript 5 |
| ORM | Prisma 7 |
| Database | MariaDB / MySQL |
| Auth | JWT (`@nestjs/jwt`) + Argon2 |
| Media Storage | ImageKit (`@imagekit/nodejs`) via Multer |
| Validation | `class-validator` / `class-transformer` + Zod |
| Rate Limiting | `@nestjs/throttler` |
| API Docs | Swagger / OpenAPI (`@nestjs/swagger`) |
| Runtime | Node.js ≥ 22.13.0 |

---

## Project Structure

```
oday-tourism/
├── prisma/
│   ├── schema.prisma          # Database schema & Prisma models
│   ├── seed.ts                # Database seeder (admin bootstrap)
│   └── migrations/            # SQL migration history
├── generated/
│   └── prisma/                # Generated Prisma client output
├── src/
│   ├── main.ts                # App bootstrap, Swagger, global pipes
│   ├── app.module.ts          # Root module
│   ├── decorators/            # Custom decorators (e.g. @IsPublic)
│   ├── pipes/                 # Zod validation pipe
│   ├── types/                 # Shared TypeScript types & env declarations
│   └── modules/
│       ├── admin/             # Admin user management & seeding
│       ├── auth/              # JWT login & guards
│       ├── database/          # Prisma service & pagination helpers
│       ├── file/              # ImageKit provider, Multer, file cleanup
│       ├── hotel/             # Hotel CRUD + translations
│       ├── room/              # Rooms nested under hotels
│       ├── addon/             # Add-ons nested under hotels
│       ├── trip/              # Trip packages CRUD + translations
│       ├── offer/             # Promotional offers
│       ├── photo-gallery/     # Photo gallery with media uploads
│       ├── security-approval/ # Service types, airline & nationality pricing
│       ├── comment/           # Client reviews
│       └── question/          # FAQ questions with translations
├── .env                       # Local environment variables (not committed)
├── .env.example               # Environment variable template
└── package.json
```

---

## Modules & API Endpoints

All routes are relative to the server root (e.g., `http://localhost:3000`).
Interactive documentation is available at `/api/docs`.

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/login` | Admin login — returns a JWT access token |

---

### Hotels

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/hotel` | Create a new hotel |
| `GET` | `/hotel` | List all hotels (paginated) |
| `GET` | `/hotel/:id` | Get hotel by ID |
| `PATCH` | `/hotel/:id` | Update hotel |
| `DELETE` | `/hotel/:id` | Delete hotel |

#### Rooms *(nested under hotel)*

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/hotel/:hotelId/room` | Add a room to a hotel |
| `GET` | `/hotel/:hotelId/room` | List hotel rooms |
| `GET` | `/hotel/:hotelId/room/:id` | Get room by ID |
| `PATCH` | `/hotel/:hotelId/room/:id` | Update room |
| `DELETE` | `/hotel/:hotelId/room/:id` | Delete room |

#### Add-ons *(nested under hotel)*

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/hotel/:hotelId/addon` | Add an add-on to a hotel |
| `GET` | `/hotel/:hotelId/addon` | List hotel add-ons |
| `GET` | `/hotel/:hotelId/addon/:id` | Get add-on by ID |
| `PATCH` | `/hotel/:hotelId/addon/:id` | Update add-on |
| `DELETE` | `/hotel/:hotelId/addon/:id` | Delete add-on |

---

### Trips

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/trip` | Create a trip package |
| `GET` | `/trip` | List all trips (paginated) |
| `GET` | `/trip/:id` | Get trip by ID |
| `PATCH` | `/trip/:id` | Update trip |
| `DELETE` | `/trip/:id` | Delete trip |

---

### Offers

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/offer` | Create an offer |
| `GET` | `/offer` | List all offers |
| `GET` | `/offer/:id` | Get offer by ID |
| `DELETE` | `/offer/:id` | Delete offer |

---

### Photo Gallery

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/photo-gallery` | Upload a photo gallery entry |
| `GET` | `/photo-gallery` | List all gallery entries |
| `GET` | `/photo-gallery/:id` | Get gallery entry by ID |
| `DELETE` | `/photo-gallery/:id` | Delete gallery entry |

---

### Security Approval

#### Service Types

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/security-approval/service-type` | Create service type |
| `GET` | `/security-approval/service-type` | List service types |
| `GET` | `/security-approval/service-type/:id` | Get service type by ID |
| `PATCH` | `/security-approval/service-type/:id` | Update service type |
| `DELETE` | `/security-approval/service-type/:id` | Delete service type |

#### Airline Pricing

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/security-approval/airlines` | List all airlines (enum) |
| `POST` | `/security-approval/airline-pricing` | Create airline pricing |
| `GET` | `/security-approval/airline-pricing` | List all airline pricing |
| `GET` | `/security-approval/airline-pricing/by-airline/:airline` | Get pricing by airline |
| `GET` | `/security-approval/airline-pricing/:id` | Get airline pricing by ID |
| `PATCH` | `/security-approval/airline-pricing/:id` | Update airline pricing |
| `DELETE` | `/security-approval/airline-pricing/:id` | Delete airline pricing |

#### Nationality Pricing

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/security-approval/nationalities` | List all nationalities (enum) |
| `POST` | `/security-approval/nationality-pricing` | Create nationality pricing |
| `GET` | `/security-approval/nationality-pricing` | List all nationality pricing |
| `GET` | `/security-approval/nationality-pricing/by-nationality/:nationality` | Get pricing by nationality |
| `GET` | `/security-approval/nationality-pricing/:id` | Get nationality pricing by ID |
| `PATCH` | `/security-approval/nationality-pricing/:id` | Update nationality pricing |
| `DELETE` | `/security-approval/nationality-pricing/:id` | Delete nationality pricing |

---

### Comments

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/comment` | Create a client review |
| `GET` | `/comment` | List all comments |
| `GET` | `/comment/:id` | Get comment by ID |
| `PATCH` | `/comment/:id` | Update comment |
| `DELETE` | `/comment/:id` | Delete comment |

---

### Questions (FAQ)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/question` | Create a FAQ question |
| `GET` | `/question` | List all questions |
| `GET` | `/question/:id` | Get question by ID |
| `PATCH` | `/question/:id` | Update question |
| `DELETE` | `/question/:id` | Delete question |

---

## Database Schema

Key entities and their relationships:

```
Admin
Hotel ──── HotelTranslation
       ├── Room
       ├── HotelAddon
       └── Asset (images)

Trip  ──── TripTranslation
       ├── TripOption ──── OptionTranslation
       ├── TripAddon  ──── TripAddonTranslation
       └── Asset (images / video URL)

Offer         ──── Asset
PhotoGallery  ──── Asset
Gallery       ──── Asset

SecurityServiceType ──── SecurityServiceTypeTranslation
AirlinePricing
NationalityPricing

Comments
Questions ──── QuestionsTranslations

Checkout  (booking snapshots)
Settings  (company info / social links — single-row)
```

**Supported Languages:** `ar` (Arabic), `en` (English)

**Supported Destinations:** Sharm El-Sheikh, Dahab, Hurghada, Marsa Alam, and more (see `DestinatiosnEnum` in schema).

---

## Getting Started

### Prerequisites

- **Node.js** `>= 22.13.0`
- **npm** `>= 10`
- A running **MariaDB** or **MySQL** instance
- An **ImageKit** account (for media uploads)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/oday-tourism.git
cd oday-tourism

# Install dependencies
npm install
```

### Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | MariaDB/MySQL connection URL |
| `JWT_SECRET` | Yes | Secret key for signing JWT tokens |
| `IMAGEKIT_SECRET_KEY` | Yes | ImageKit private API key |
| `PORT` | No | HTTP server port (default: `3000`) |
| `NODE_ENV` | No | `development` or `production` |
| `ADMIN_EMAIL` | Yes (seed) | Default admin email for bootstrap |
| `ADMIN_PASSWORD` | Yes (seed) | Default admin password for bootstrap |

**Example `.env`:**

```env
DATABASE_URL="mysql://user:password@localhost:3306/oday_tourism"
JWT_SECRET="your-super-secret-jwt-key"
IMAGEKIT_SECRET_KEY="your-imagekit-private-key"
PORT=3000
NODE_ENV=development
ADMIN_EMAIL=admin@odaytourism.com
ADMIN_PASSWORD=StrongPassword123!
```

### Database Setup

```bash
# Run all pending migrations
npx prisma migrate deploy

# Generate the Prisma client
npx prisma generate
```

> For local development you can also use `npx prisma migrate dev` to apply and track new migrations.

### Running the App

```bash
# Development (watch mode)
npm run start:dev

# Production build
npm run build
npm run start:prod

# Debug mode
npm run start:debug
```

The server starts on `http://localhost:3000` by default.

---

## Seeding

Seed the database to create the default admin user (requires `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`):

```bash
npm run seed
```

> The admin is also bootstrapped automatically on application startup via `AdminService` if no admin exists.

---

## API Documentation

Once the server is running, the interactive Swagger UI is available at:

```
http://localhost:3000/api/docs
```

It documents all endpoints with request/response schemas, authentication requirements, and example payloads.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run start` | Start the application |
| `npm run start:dev` | Start in development watch mode |
| `npm run start:debug` | Start in debug + watch mode |
| `npm run start:prod` | Start the compiled production build |
| `npm run build` | Generate Prisma client and compile TypeScript |
| `npm run seed` | Seed the database with default data |
| `npm run format` | Format source code with Prettier |
| `npm run lint` | Lint and auto-fix with ESLint |
| `npm run test` | Run unit tests |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:cov` | Run tests with coverage report |
| `npm run test:e2e` | Run end-to-end tests |

---

## Rate Limiting

The API enforces global rate limits via `@nestjs/throttler`:

- **Short window:** 5 requests / 1 second
- **Medium window:** 100 requests / 60 seconds

Exceeding these limits returns `429 Too Many Requests`.

---

## License

This project is **UNLICENSED** — all rights reserved to Oday Tourism.
