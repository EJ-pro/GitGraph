<?php

namespace App\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Models\User;
use App\Services\UserService;

/**
 * Handles HTTP requests related to users.
 */
class UserController extends Controller {

    public function __construct(
        private UserService $service
    ) {}

    public function index(): JsonResponse {
        return response()->json($this->service->all());
    }

    public function show(int $id): JsonResponse {
        $user = $this->service->find($id);
        if (!$user) {
            return response()->json(['error' => 'Not found'], 404);
        }
        return response()->json($user);
    }

    public function store(Request $request): JsonResponse {
        $user = $this->service->create($request->validated());
        return response()->json($user, 201);
    }

    public function destroy(int $id): JsonResponse {
        $this->service->delete($id);
        return response()->json(null, 204);
    }
}

function format_user_name(string $first, string $last): string {
    return trim("$first $last");
}
