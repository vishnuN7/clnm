# Production Deployment Guide

## Overview
This guide covers the standard deployment path for the CLN application using Docker Compose and an Nginx reverse proxy.

## Prerequisites
- VPS or server with Docker and Docker Compose installed
- Domain or host name pointed at the server
- Production environment variables prepared
- SSL certificate available or ready to be issued

## Deployment Flow
1. Copy the repository to the server.
2. Configure environment variables for backend and database access.
3. Start the stack with Docker Compose.
4. Verify that the backend responds through the reverse proxy.
5. Confirm uploads, authentication, and admin pages load correctly.

## Security Notes
- Keep the backend behind Nginx.
- Use a strong JWT secret.
- Restrict employee access to the allowed office network.
- Keep uploaded files on the persistent Docker volume.

## Verification
- Login works for admin and employee accounts.
- API routes respond through the proxy.
- File uploads are accessible through the uploads path.
- Rate limiting and CORS behave as expected.

## Rollback
If deployment fails, stop the containers, restore the previous image or code revision, and re-check environment variables before retrying.
