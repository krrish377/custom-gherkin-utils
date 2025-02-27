@smoke
@login
Feature: User Login

  Background:
    Given the user is on the login page

  Scenario: Login with <url>
    Given I enter "user1" in the username field
    And I enter "pass123" in the password field
    Then I should see the dashboard
