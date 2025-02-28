@featureTag
Feature: Demonstrate backgrounds at both feature and rule levels
  feature description

  Background: Background name1
    background description

    Given the system is in a valid initial state at the feature level

  @ruleTag
  Rule: Basic rule demonstration
    This rule ensures that user behaviors follow a certain pattern.

    Background:
      Given the system is further set up for this rule

    @scenarioOutlineTag
    Scenario Outline: Perform multiple actions with different outcomes - <pageName>
      Given I am on the <pageName> page
      When I perform click "Login"
      Then I should see the login screen appears

      @examplestag1
      Examples:
        | pageName |
        | Home     |
