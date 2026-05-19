using System;
using System.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace App.Services {

    /// <summary>
    /// Contract for user-related operations.
    /// </summary>
    public interface IUserService {
        User GetById(int id);
        Task<List<User>> GetAllAsync();
    }

    /// <summary>
    /// Handles all user management business logic.
    /// </summary>
    public class UserService : BaseService, IUserService {

        private readonly IUserRepository _repo;

        public UserService(IUserRepository repo) {
            _repo = repo;
        }

        public User GetById(int id) {
            return _repo.FindById(id);
        }

        public async Task<List<User>> GetAllAsync() {
            var users = await _repo.GetAllAsync();
            return users.Where(u => u.IsActive).ToList();
        }

        public User Create(string name, string email) {
            var user = new User { Name = name, Email = email };
            return _repo.Save(user);
        }
    }
}
