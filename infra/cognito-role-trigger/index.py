def handler(event, context):
    """
    Pre-Token-Generation Lambda trigger.
    Injects custom:role from user attributes into the ID token as 'role' claim.
    """
    attrs = event.get('request', {}).get('userAttributes', {})
    role = attrs.get('custom:role', 'candidate')

    # Validate — only allow known roles
    if role not in ('candidate', 'faculty', 'admin'):
        role = 'candidate'

    event['response'] = {
        'claimsOverrideDetails': {
            'claimsToAddOrOverride': {
                'role': role,
            }
        }
    }
    return event
