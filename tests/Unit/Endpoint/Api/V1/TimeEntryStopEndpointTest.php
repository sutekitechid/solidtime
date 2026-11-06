<?php

declare(strict_types=1);

namespace Tests\Unit\Endpoint\Api\V1;

use App\Enums\Role;
use App\Http\Controllers\Api\V1\TimeEntryController;
use App\Models\Member;
use App\Models\Organization;
use App\Models\TimeEntry;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Laravel\Passport\Passport;
use PHPUnit\Framework\Attributes\UsesClass;

#[UsesClass(TimeEntryController::class)]
class TimeEntryStopEndpointTest extends ApiEndpointTestAbstract
{
    private function createRunningEntryForRole(Organization $organization, Role $role): TimeEntry
    {
        $user = User::factory()->create();
        $member = Member::factory()->forOrganization($organization)->forUser($user)->role($role)->create();

        return TimeEntry::factory()->forOrganization($organization)->forMember($member)->active()->create();
    }

    private function stopEntry(object $actorData, TimeEntry $entry): TestResponse
    {
        Passport::actingAs($actorData->user);

        return $this->putJson(route('api.v1.time-entries.update', [$actorData->organization->getKey(), $entry->getKey()]), [
            'end' => Carbon::now()->toIso8601ZuluString(),
        ]);
    }

    public function test_manager_can_stop_employee_running_timer(): void
    {
        // Arrange
        $data = $this->createUserWithRole(Role::Manager);
        $timeEntry = $this->createRunningEntryForRole($data->organization, Role::Employee);

        // Act
        $response = $this->stopEntry($data, $timeEntry);

        // Assert
        $this->assertResponseCode($response, 200);
        $timeEntry->refresh();
        $this->assertNotNull($timeEntry->end);
    }

    public function test_manager_can_stop_other_manager_running_timer(): void
    {
        // Arrange
        $data = $this->createUserWithRole(Role::Manager);
        $timeEntry = $this->createRunningEntryForRole($data->organization, Role::Manager);

        // Act
        $response = $this->stopEntry($data, $timeEntry);

        // Assert
        $this->assertResponseCode($response, 200);
        $timeEntry->refresh();
        $this->assertNotNull($timeEntry->end);
    }

    public function test_manager_can_stop_own_running_timer(): void
    {
        // Arrange
        $data = $this->createUserWithRole(Role::Manager);
        $timeEntry = TimeEntry::factory()->forOrganization($data->organization)->forMember($data->member)->active()->create();

        // Act
        $response = $this->stopEntry($data, $timeEntry);

        // Assert
        $this->assertResponseCode($response, 200);
        $timeEntry->refresh();
        $this->assertNotNull($timeEntry->end);
    }

    public function test_manager_cannot_stop_admin_running_timer(): void
    {
        // Arrange
        $data = $this->createUserWithRole(Role::Manager);
        $timeEntry = $this->createRunningEntryForRole($data->organization, Role::Admin);

        // Act
        $response = $this->stopEntry($data, $timeEntry);

        // Assert
        $response->assertForbidden();
        $this->assertDatabaseHas(TimeEntry::class, [
            'id' => $timeEntry->getKey(),
            'end' => null,
        ]);
    }

    public function test_manager_cannot_stop_owner_running_timer(): void
    {
        // Arrange
        $data = $this->createUserWithRole(Role::Manager);
        $timeEntry = TimeEntry::factory()->forOrganization($data->organization)->forMember($data->ownerMember)->active()->create();

        // Act
        $response = $this->stopEntry($data, $timeEntry);

        // Assert
        $response->assertForbidden();
        $this->assertDatabaseHas(TimeEntry::class, [
            'id' => $timeEntry->getKey(),
            'end' => null,
        ]);
    }

    public function test_admin_can_stop_admin_manager_and_employee_running_timers(): void
    {
        // Arrange
        $data = $this->createUserWithRole(Role::Admin);
        $entries = [
            $this->createRunningEntryForRole($data->organization, Role::Admin),
            $this->createRunningEntryForRole($data->organization, Role::Manager),
            $this->createRunningEntryForRole($data->organization, Role::Employee),
        ];

        // Act + Assert
        foreach ($entries as $timeEntry) {
            $response = $this->stopEntry($data, $timeEntry);
            $this->assertResponseCode($response, 200);
            $timeEntry->refresh();
            $this->assertNotNull($timeEntry->end);
        }
    }

    public function test_admin_cannot_stop_owner_running_timer(): void
    {
        // Arrange
        $data = $this->createUserWithRole(Role::Admin);
        $timeEntry = TimeEntry::factory()->forOrganization($data->organization)->forMember($data->ownerMember)->active()->create();

        // Act
        $response = $this->stopEntry($data, $timeEntry);

        // Assert
        $response->assertForbidden();
        $this->assertDatabaseHas(TimeEntry::class, [
            'id' => $timeEntry->getKey(),
            'end' => null,
        ]);
    }

    public function test_owner_can_stop_any_running_timer(): void
    {
        // Arrange
        $data = $this->createUserWithRole(Role::Owner);
        $secondOwner = Member::factory()->forOrganization($data->organization)->forUser(User::factory()->create())->role(Role::Owner)->create();
        $entries = [
            TimeEntry::factory()->forOrganization($data->organization)->forMember($secondOwner)->active()->create(),
            $this->createRunningEntryForRole($data->organization, Role::Admin),
            $this->createRunningEntryForRole($data->organization, Role::Manager),
            $this->createRunningEntryForRole($data->organization, Role::Employee),
        ];

        // Act + Assert
        foreach ($entries as $timeEntry) {
            $response = $this->stopEntry($data, $timeEntry);
            $this->assertResponseCode($response, 200);
            $timeEntry->refresh();
            $this->assertNotNull($timeEntry->end);
        }
    }

    public function test_employee_cannot_stop_other_running_timer(): void
    {
        // Arrange
        $data = $this->createUserWithRole(Role::Employee);
        $timeEntry = $this->createRunningEntryForRole($data->organization, Role::Employee);

        // Act
        $response = $this->stopEntry($data, $timeEntry);

        // Assert
        $response->assertForbidden();
        $this->assertDatabaseHas(TimeEntry::class, [
            'id' => $timeEntry->getKey(),
            'end' => null,
        ]);
    }

    public function test_unknown_role_cannot_stop_other_running_timer(): void
    {
        // Arrange
        $data = $this->createUserWithPermission([
            'time-entries:update:all',
        ]);
        $timeEntry = $this->createRunningEntryForRole($data->organization, Role::Employee);

        // Act
        $response = $this->stopEntry($data, $timeEntry);

        // Assert
        $response->assertForbidden();
        $this->assertDatabaseHas(TimeEntry::class, [
            'id' => $timeEntry->getKey(),
            'end' => null,
        ]);
    }

    public function test_manager_cannot_stop_running_timer_with_null_target_role(): void
    {
        // Arrange
        $data = $this->createUserWithRole(Role::Manager);
        $user = User::factory()->create();
        $member = Member::factory()->forOrganization($data->organization)->forUser($user)->role(Role::Employee)->create();
        $member->role = null;
        $member->save();
        $timeEntry = TimeEntry::factory()->forOrganization($data->organization)->forMember($member)->active()->create();

        // Act
        $response = $this->stopEntry($data, $timeEntry);

        // Assert
        $response->assertForbidden();
        $this->assertDatabaseHas(TimeEntry::class, [
            'id' => $timeEntry->getKey(),
            'end' => null,
        ]);
    }

    public function test_update_multiple_rejects_timer_state_changes(): void
    {
        // Arrange
        $data = $this->createUserWithRole(Role::Manager);
        $adminEntry = $this->createRunningEntryForRole($data->organization, Role::Admin);
        Passport::actingAs($data->user);

        // Act
        $response = $this->patchJson(route('api.v1.time-entries.update-multiple', [$data->organization->getKey()]), [
            'ids' => [
                $adminEntry->getKey(),
            ],
            'changes' => [
                'end' => Carbon::now()->toIso8601ZuluString(),
            ],
        ]);

        // Assert
        $response->assertStatus(422);
        $response->assertJsonValidationErrors([
            'changes.end',
        ]);
        $this->assertDatabaseHas(TimeEntry::class, [
            'id' => $adminEntry->getKey(),
            'end' => null,
        ]);
    }
}
