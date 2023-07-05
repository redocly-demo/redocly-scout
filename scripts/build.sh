#!/bin/sh

set -e

IMAGE_NAME=redocly/scout
COMMIT_HASH=$(git rev-parse HEAD)

echo 'Building docker image...'

docker build -t $IMAGE_NAME --build-arg GIT_SHA=$COMMIT_HASH .
