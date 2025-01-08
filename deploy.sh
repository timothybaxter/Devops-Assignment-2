#!/bin/bash
echo "Starting deployment process..."

# Function to handle npm install for each service
install_dependencies() {
    local service_dir=$1
    if [ -d "$service_dir" ]; then
        echo "Installing dependencies for $service_dir..."
        cd $service_dir
        # Remove node_modules and package-lock.json to ensure clean install
        rm -rf node_modules package-lock.json
        # Fresh install
        npm install --production
        cd ..
    else
        echo "Directory $service_dir not found, skipping..."
    fi
}

# Install dependencies for each service
install_dependencies "auth-lambda-local"
install_dependencies "video-lambda-local"
install_dependencies "watchlist-lambda-local"

# Package Lambda functions
echo "Packaging Lambda functions..."
for service in auth-lambda-local video-lambda-local watchlist-lambda-local; do
    if [ -d "$service" ]; then
        echo "Packaging $service..."
        cd $service
        zip -r "../${service%-local}.zip" . -x "tests/*" "*.test.js" "*.spec.js"
        cd ..
    fi
done

# Deploy to AWS
echo "Uploading to S3..."
for zip in auth-lambda.zip video-lambda.zip watchlist-lambda.zip; do
    if [ -f "$zip" ]; then
        aws s3 cp $zip "s3://dread-video-storage/"
        echo "Updating Lambda function ${zip%.zip}..."
        aws lambda update-function-code \
            --function-name "${zip%.zip}" \
            --s3-bucket dread-video-storage \
            --s3-key "$zip"
    fi
done

# Cleanup
echo "Cleaning up..."
rm -f *.zip

echo "Deployment complete!"
