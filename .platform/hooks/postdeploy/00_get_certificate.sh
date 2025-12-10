#!/usr/bin/env bash
# .platform/hooks/postdeploy/00_get_certificate.sh
sudo certbot -n -d mcminnville-pallet-env.eba-an9y2jq6.us-east-2.elasticbeanstalk.com --nginx --agree-tos --email isaac.pratte@gmail.com