@regression
Feature: Data Table Handling

  Background: launching website
    Given user launches url
    When the user is on the login page

  @sanity
  Scenario: Verify user data table
    Given the following users exist
      | name  | age |
      | Alice | 25  |
      | Bob   | 30  |
    Then the system should validate the users
