Feature: Tagged scenarios

  @smoke
  Scenario: Included scenario
    Given a smoke step

  @slow
  Scenario: Excluded scenario
    Given a slow step
