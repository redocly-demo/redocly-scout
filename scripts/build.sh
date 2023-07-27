#!/bin/sh

set -e

IMAGE_NAME=redocly/scout
IMAGE_VERSION=$(npm pkg get version | tr -d \")

echo 'Building docker image...'

docker build -t $IMAGE_NAME --build-arg IMAGE_VERSION=$IMAGE_VERSION .
