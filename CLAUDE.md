# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a reusable webstack template organized into 6 sequential stages with strict dependency management. Each stage delivers a complete, functional slice that can be independently tested and deployed.

## Architecture & Development Stages

### Stage 0: Core Infrastructure & Security Baseline
- Docker setup with docker-compose.yml and environment configuration
- Deployment scripts for start/stop/redeploy operations
- CI/CD pipeline with GitHub Actions
- Basic web app directory structure

**Key Technologies:** Docker, Docker Compose, GitHub Actions, Node.js

### Stage 1: Authentication & User Foundation  
- Modular SSO login system (designed to support multiple providers)
- Secure user/account data storage with encryption
- Role-based access control (RBAC)
- Audit logging for key events
- Landing page and authenticated user page structure

**Key Technologies:** OAuth2/OpenID Connect, Auth0, PostgreSQL, React Router, JWT

### Stage 2: Basic User Features
- User profile settings and notification preferences
- Public landing page with feature previews

**Key Technologies:** React, Redux/Context API, Chart.js/Recharts

### Stage 3: Core API Integration & Data Pipeline
- External REST API integration with OAuth2 token refresh
- Data transformation, normalization, and historical storage
- Redis caching layer and database optimization
- Automated data fetching with rate limiting
- KPI calculations and error monitoring

**Key Technologies:** Axios, Redis, PostgreSQL, Node-cron, BullMQ, Sentry

### Stage 4: Theming & Modular System
- Centralized theming system with multiple brand profiles
- Plugin API contract and module loader system
- Feature toggles and hot-swappable themes
- Dynamic navigation and deployment configurations

**Key Technologies:** CSS variables, Tailwind CSS, Webpack dynamic imports, LaunchDarkly

### Stage 5: Admin & Analytics Foundation
- Admin dashboard with user metrics
- A/B testing system
- Load balancing and microservices architecture
- Advanced monitoring with Prometheus + Grafana

**Key Technologies:** React, Ant Design/MUI, Nginx/HAProxy, Kubernetes, Prometheus

### Stage 6: Advanced User Experience
- Modular dashboard widgets with live data streaming
- Real-time alerts via WebSocket
- Advanced analytics and micro-frontend architecture

**Key Technologies:** D3.js, Socket.IO, WebSockets, Redis Pub/Sub

## Development Commands

### Initial Setup
```bash
# Build and start the stack
docker-compose up --build

# Stop the stack
docker-compose down

# Complete redeploy
./deploy.sh restart
```

### Testing & Quality
```bash
# Run full test deployment after each stage
npm test

# Run linting
npm run lint

# Run type checking
npm run typecheck

# API integration tests
npm run test:api

# Run single test file
npm test -- --testPathPattern=<test-file>
```

### Development Workflow
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Run database migrations
npm run migrate

# Seed database with test data
npm run seed
```

## Architecture Guidelines

### Modular Design
- Each stage builds upon previous stages with clear dependencies
- Plugin system allows feature modules to be enabled/disabled via feature toggles
- Authentication system is designed as pluggable modules for easy SSO provider swapping

### Security Requirements
- All user data storage must use encryption (AES-256)
- JWT tokens for session management with secure refresh mechanisms
- RBAC implementation for feature access control
- Comprehensive audit logging for compliance

### Data Flow
1. External API integration with OAuth2 authentication
2. Data transformation and normalization layer
3. Historical storage in PostgreSQL with Redis caching
4. Real-time streaming via WebSocket for live updates
5. KPI calculations and analytics processing

### Testing Strategy
- Full test deployment required after each stage completion
- Generic API integration test suite for external services
- Component testing for React UI elements
- Integration testing for authentication flows

### Deployment Architecture
- Single environment deployment (no dev/prod separation)
- Docker containerization with docker-compose orchestration
- GitHub Actions CI/CD pipeline
- Load balancing with Nginx/HAProxy for production scaling

### Plugin Development
- Plugin API contract defined with TypeScript interfaces
- Dynamic module loading with Webpack
- Feature toggles integrated with theming system
- Hot-swappable themes without redeploy requirement

## Stage Dependencies

Each stage must be completed and tested before proceeding to the next. The dependency chain ensures:
- Stage 0 provides infrastructure foundation
- Stage 1 establishes secure authentication before features
- Stage 2-3 build core functionality on authenticated foundation  
- Stage 4 adds modularity and theming to existing features
- Stage 5-6 provide advanced admin and user experience layers

## Technical Documentation Requirements

All implementations must include:
- AI-interpretable technical documentation
- API contracts and interfaces
- Database schema documentation
- Plugin development guides
- Configuration examples for different deployment scenarios