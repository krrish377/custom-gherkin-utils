Feature: User Authentication

  Rule: Valid Login
    The system should allow valid users to log in.

    Scenario: Successful login
      Given the user enters username "adminUser" and password "securePass123"
      When the user submits the form
      Then the user should be logged in
