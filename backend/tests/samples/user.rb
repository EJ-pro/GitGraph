require 'rails'
require 'active_record'
require_relative '../concerns/validatable'

# Shared helpers for formatting data in views.
module ApplicationHelper
  def format_date(date)
    date.strftime('%Y-%m-%d')
  end

  def truncate_text(text, length: 100)
    text.length > length ? "#{text[0...length]}..." : text
  end
end

# Represents a registered user in the system.
class User < ApplicationRecord
  include Validatable

  validates :email, presence: true, uniqueness: true
  validates :name, presence: true

  has_many :projects, dependent: :destroy
  belongs_to :organization, optional: true

  def full_name
    "#{first_name} #{last_name}".strip
  end

  def active?
    deleted_at.nil?
  end

  def self.find_active
    where(deleted_at: nil)
  end

  def self.search(query)
    where('name ILIKE ?', "%#{query}%")
  end
end

class AdminUser < User
  def admin?
    true
  end
end

def send_welcome_email(user)
  UserMailer.welcome(user).deliver_later
end
