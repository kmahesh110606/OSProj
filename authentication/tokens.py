from django.contrib.auth.tokens import PasswordResetTokenGenerator


class TokenGenerator(PasswordResetTokenGenerator):
    def _make_hash_value(self, user, timestamp):
        # Use built-in str to avoid external dependencies.
        # Include is_active so activation tokens become invalid after activation.
        return f"{str(user.pk)}{str(timestamp)}{str(getattr(user,'is_active', True))}"


generate_token = TokenGenerator()