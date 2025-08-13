#!/bin/bash

# Site Template Deployment Script
# Usage: ./deploy.sh [start|stop|restart|build|logs|status|clean]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    log_info "Checking requirements..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    if [ ! -f "$ENV_FILE" ]; then
        log_warning ".env file not found, copying from .env.example"
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_info "Please edit .env file with your configuration before running again"
            exit 1
        else
            log_error ".env.example not found"
            exit 1
        fi
    fi
    
    log_success "Requirements check passed"
}

start_services() {
    log_info "Starting services..."
    docker-compose up -d
    log_success "Services started successfully"
    show_status
}

stop_services() {
    log_info "Stopping services..."
    docker-compose down
    log_success "Services stopped successfully"
}

build_services() {
    log_info "Building services..."
    docker-compose build --no-cache
    log_success "Services built successfully"
}

restart_services() {
    log_info "Restarting services..."
    stop_services
    build_services
    start_services
    log_success "Services restarted successfully"
}

show_logs() {
    log_info "Showing logs (Press Ctrl+C to exit)..."
    docker-compose logs -f
}

show_status() {
    log_info "Service status:"
    docker-compose ps
    
    log_info "Health status:"
    echo "Webapp: http://localhost:${WEBAPP_PORT:-3000}"
    echo "Database: localhost:${POSTGRES_PORT:-5432}"
    echo "Redis: localhost:${REDIS_PORT:-6379}"
    echo "Nginx: http://localhost:${HTTP_PORT:-80}"
}

clean_all() {
    log_warning "This will remove all containers, networks, images, and volumes!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning up..."
        docker-compose down -v --remove-orphans
        docker-compose rm -f
        docker system prune -f
        docker volume prune -f
        log_success "Cleanup completed"
    else
        log_info "Cleanup cancelled"
    fi
}

run_tests() {
    log_info "Running tests..."
    
    # Check if services are running
    if ! docker-compose ps | grep -q "Up"; then
        log_error "Services are not running. Please start them first with: ./deploy.sh start"
        exit 1
    fi
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10
    
    # Test database connection
    log_info "Testing database connection..."
    docker-compose exec -T postgres pg_isready -U ${POSTGRES_USER:-admin} || {
        log_error "Database connection failed"
        exit 1
    }
    
    # Test Redis connection
    log_info "Testing Redis connection..."
    docker-compose exec -T redis redis-cli ping || {
        log_error "Redis connection failed"
        exit 1
    }
    
    # Test webapp endpoint
    log_info "Testing webapp endpoint..."
    sleep 5
    if curl -f -s http://localhost:${WEBAPP_PORT:-3000}/health > /dev/null; then
        log_success "Webapp is responding"
    else
        log_warning "Webapp health check failed (may not be implemented yet)"
    fi
    
    log_success "Basic deployment tests completed"
}

# Main script logic
case "$1" in
    start)
        check_requirements
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        check_requirements
        restart_services
        ;;
    build)
        check_requirements
        build_services
        ;;
    logs)
        show_logs
        ;;
    status)
        show_status
        ;;
    clean)
        clean_all
        ;;
    test)
        run_tests
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|build|logs|status|clean|test}"
        echo ""
        echo "Commands:"
        echo "  start    - Start all services"
        echo "  stop     - Stop all services"
        echo "  restart  - Stop, rebuild, and start all services"
        echo "  build    - Build all services without starting"
        echo "  logs     - Show logs from all services"
        echo "  status   - Show current status of all services"
        echo "  clean    - Remove all containers, networks, images, and volumes"
        echo "  test     - Run basic deployment tests"
        exit 1
        ;;
esac